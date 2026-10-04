import type OpenAI from "openai";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import { recordingStarts, type RecordingPart } from "@/lib/meeting-dto";

export const SUMMARY_MODEL = process.env.OPENAI_SUMMARY_MODEL || "gpt-5.5";

export type ActionItem = {
  task: string;
  owner: string | null; // 會議中沒明確指派就是 null
  due: string | null; // 保留原話中的期限（例如「10月15號」「下週五前」），不自行換算日期
};

export type MeetingMinutes = {
  title: string;
  summary: string;
  keyPoints: string[];
  actionItems: ActionItem[];
};

type TranscriptLine = { speaker: string; startMs: number; text: string };

/** 補充資料：已從 Blob 下載，依類型轉成模型看得懂的輸入 */
export type SummaryAttachment = {
  fileName: string;
  kind: "image" | "pdf" | "text";
  mime: string;
  data: Buffer;
};

// 單一文字檔放進提示的上限，避免超長檔案吃掉整個 context
const MAX_TEXT_ATTACHMENT_CHARS = 100_000;

const INSTRUCTIONS = `你是專業的會議記錄整理助理。根據使用者提供的會議逐字稿，整理出：
0. title：20 字以內的會議標題，點出會議主題（例如「產品週會：新版上線時程與行銷預算」）。
1. summary：3–6 句的會議摘要，說明會議目的、主要討論內容與結論。
2. keyPoints：會議重點條列，每點一句話，涵蓋重要資訊、決議與數字。
3. actionItems：會議中提到需要後續執行的待辦事項。
   - owner 只在逐字稿明確提到負責人時填寫，否則填 null，不要猜。
   - due 只在逐字稿明確提到期限時填寫，照原話寫（例如「10月15號」「下週五前」），否則填 null。
   - 沒有待辦事項就回傳空陣列。

規則：
- 一律使用台灣繁體中文。
- 只根據逐字稿內容整理，不要補充逐字稿沒有的資訊。
- 逐字稿為語音辨識結果，可能有錯字或斷句不自然，請依上下文理解。
- 講者標籤（A、B…）是自動辨識的代號，除非逐字稿中有人自我介紹或被點名，否則不要推測真實姓名。

若有附上補充資料（簡報、圖片、文件）：
- 以逐字稿的討論內容為主軸，補充資料用來理解脈絡、校正專有名詞、人名與數字。
- 補充資料中與會議討論直接相關的關鍵資訊（例如簡報上的數據、時程）可以寫進摘要與重點。
- 補充資料中會議完全沒討論到的內容不要寫進去。
- 逐字稿與補充資料衝突時，以會議中的口頭結論為準。`;

// Structured Outputs：強制模型回傳符合這個 schema 的 JSON
const MINUTES_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    keyPoints: { type: "array", items: { type: "string" } },
    actionItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          task: { type: "string" },
          owner: { type: ["string", "null"] },
          due: { type: ["string", "null"] },
        },
        required: ["task", "owner", "due"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "summary", "keyPoints", "actionItems"],
  additionalProperties: false,
};

function formatTimestamp(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// 有講者分段時帶上講者與時間，讓模型分得出誰說了什麼；
// 多個錄音檔時在每個檔案開頭插入標記，讓模型知道內容是依序接續的
function formatTranscript(fullText: string, segments: TranscriptLine[], recordings: RecordingPart[]) {
  if (segments.length === 0) return fullText;
  const starts = recordingStarts(segments, recordings);
  const header = (r: number) => `--- 第 ${r + 1} 個錄音檔（${recordings[r].fileName}）---`;
  return segments
    .flatMap((s, i) => {
      const line = `[${formatTimestamp(s.startMs)}] ${s.speaker}：${s.text}`;
      const r = i === 0 && recordings.length > 1 ? 0 : starts.get(i);
      return r === undefined ? [line] : [header(r), line];
    })
    .join("\n");
}

function attachmentContent(a: SummaryAttachment): ResponseInputContent[] {
  const label = `【補充資料：${a.fileName}】`;
  const dataUrl = () => `data:${a.mime};base64,${a.data.toString("base64")}`;
  switch (a.kind) {
    case "image":
      return [
        { type: "input_text", text: label },
        { type: "input_image", detail: "auto", image_url: dataUrl() },
      ];
    case "pdf":
      return [
        { type: "input_text", text: label },
        { type: "input_file", filename: a.fileName, file_data: dataUrl() },
      ];
    case "text": {
      const text = a.data.toString("utf8");
      const clipped =
        text.length > MAX_TEXT_ATTACHMENT_CHARS ? `${text.slice(0, MAX_TEXT_ATTACHMENT_CHARS)}\n…（以下省略）` : text;
      return [{ type: "input_text", text: `${label}\n${clipped}` }];
    }
  }
}

export async function summarizeTranscript(
  openai: OpenAI,
  fullText: string,
  segments: TranscriptLine[],
  { attachments = [], recordings = [] }: { attachments?: SummaryAttachment[]; recordings?: RecordingPart[] } = {},
): Promise<MeetingMinutes> {
  const intro =
    recordings.length > 1
      ? `以下是會議逐字稿，由 ${recordings.length} 個錄音檔依順序接續而成，屬於同一場會議：`
      : "以下是會議逐字稿：";
  const transcriptText = `${intro}\n\n${formatTranscript(fullText, segments, recordings)}`;
  const response = await openai.responses.create({
    model: SUMMARY_MODEL,
    reasoning: { effort: "low" },
    instructions: INSTRUCTIONS,
    input:
      attachments.length === 0
        ? transcriptText
        : [
            {
              role: "user",
              content: [
                { type: "input_text", text: transcriptText },
                { type: "input_text", text: `以下是會議的補充資料，共 ${attachments.length} 份：` },
                ...attachments.flatMap(attachmentContent),
              ],
            },
          ],
    text: {
      format: {
        type: "json_schema",
        name: "meeting_minutes",
        schema: MINUTES_SCHEMA,
        strict: true,
      },
    },
  });

  if (response.status !== "completed" || !response.output_text) {
    throw new Error(`模型沒有完成整理（status: ${response.status}）`);
  }

  return JSON.parse(response.output_text) as MeetingMinutes;
}
