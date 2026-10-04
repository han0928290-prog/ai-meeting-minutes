import type OpenAI from "openai";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import { recordingStarts, type RecordingPart } from "@/lib/meeting-dto";
import type { NoteType } from "@/lib/upload-config";

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

export type NoteSection = { heading: string; points: string[] };
export type Term = { term: string; definition: string };

export type StudyNotes = {
  title: string;
  summary: string;
  sections: NoteSection[]; // 重點概念，依主題分組
  terms: Term[]; // 名詞解釋
  examples: string[]; // 例子與補充
};

/** AI 整理結果，依紀錄類型而不同 */
export type AiNotes = { type: "meeting"; minutes: MeetingMinutes } | { type: "study"; notes: StudyNotes };

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

// ---------- 會議記錄 ----------

const MEETING_INSTRUCTIONS = `你是專業的會議記錄整理助理。根據使用者提供的會議逐字稿，整理出：
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
const MEETING_SCHEMA = {
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

// ---------- 讀書筆記 ----------

const STUDY_INSTRUCTIONS = `你是專業的讀書筆記整理助理。使用者提供的是課程、講座或讀書內容的錄音逐字稿，請整理成方便複習的筆記：
0. title：20 字以內的標題，點出這份內容的主題（例如「個體經濟學：邊際效用與需求曲線」）。
1. summary：3–6 句的摘要，說明這份內容在講什麼、核心觀念與結論。
2. sections：重點概念，依主題或段落分成 2–8 組，順序跟內容的講解順序一致。
   - heading：這組的主題名稱，簡短明確。
   - points：2–6 點，每點用一到兩句完整說明一個觀念，要能單獨看懂，不要只寫關鍵字。
3. terms：關鍵名詞解釋。
   - term：名詞（有英文原文時附上，例如「機會成本（Opportunity Cost）」）。
   - definition：一到兩句的定義，以講解內容為準；講解中沒有明確定義時，依上下文簡要說明。
   - 沒有值得解釋的名詞就回傳空陣列。
4. examples：講解中提到的例子、案例、比喻或補充說明，每點一句話並點出它在說明哪個觀念。沒有就回傳空陣列。

規則：
- 一律使用台灣繁體中文。
- 寫成可以直接拿來複習的筆記，不要寫「講者提到」「老師說」這類轉述口吻。
- 只根據提供的內容整理，不要加入內容中沒有的知識。
- 逐字稿為語音辨識結果，可能有錯字或斷句不自然，請依上下文理解；專有名詞拼錯時改成正確寫法。
- 逐字稿中閒聊、點名、課務宣布等與學習內容無關的部分不要寫進筆記。

若有附上補充資料（講義、課本、簡報、板書照片）：
- 補充資料是重要的內容來源，和錄音互相補充：用來校正名詞、公式與數字，並把講義上與講解相關的重點整合進筆記。
- 講義中有、但錄音中沒講到的重要內容，可以簡短收錄並在句末標註「（講義）」。
- 錄音與講義衝突時，以錄音中的講解為準。`;

const STUDY_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "string" },
          points: { type: "array", items: { type: "string" } },
        },
        required: ["heading", "points"],
        additionalProperties: false,
      },
    },
    terms: {
      type: "array",
      items: {
        type: "object",
        properties: {
          term: { type: "string" },
          definition: { type: "string" },
        },
        required: ["term", "definition"],
        additionalProperties: false,
      },
    },
    examples: { type: "array", items: { type: "string" } },
  },
  required: ["title", "summary", "sections", "terms", "examples"],
  additionalProperties: false,
};

const BY_TYPE = {
  meeting: { instructions: MEETING_INSTRUCTIONS, schema: MEETING_SCHEMA, schemaName: "meeting_minutes", noun: "會議" },
  study: { instructions: STUDY_INSTRUCTIONS, schema: STUDY_SCHEMA, schemaName: "study_notes", noun: "課程／讀書內容" },
} satisfies Record<NoteType, unknown>;

// ---------- 共用：組合交給模型的輸入 ----------

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
  type: NoteType,
  fullText: string,
  segments: TranscriptLine[],
  { attachments = [], recordings = [] }: { attachments?: SummaryAttachment[]; recordings?: RecordingPart[] } = {},
): Promise<AiNotes> {
  const config = BY_TYPE[type];
  const intro =
    recordings.length > 1
      ? `以下是${config.noun}的逐字稿，由 ${recordings.length} 個錄音檔依順序接續而成，屬於同一份內容：`
      : `以下是${config.noun}的逐字稿：`;
  const transcriptText = `${intro}\n\n${formatTranscript(fullText, segments, recordings)}`;
  const response = await openai.responses.create({
    model: SUMMARY_MODEL,
    reasoning: { effort: "low" },
    instructions: config.instructions,
    input:
      attachments.length === 0
        ? transcriptText
        : [
            {
              role: "user",
              content: [
                { type: "input_text", text: transcriptText },
                { type: "input_text", text: `以下是補充資料，共 ${attachments.length} 份：` },
                ...attachments.flatMap(attachmentContent),
              ],
            },
          ],
    text: {
      format: {
        type: "json_schema",
        name: config.schemaName,
        schema: config.schema,
        strict: true,
      },
    },
  });

  if (response.status !== "completed" || !response.output_text) {
    throw new Error(`模型沒有完成整理（status: ${response.status}）`);
  }

  const parsed: unknown = JSON.parse(response.output_text);
  return type === "study"
    ? { type, notes: parsed as StudyNotes }
    : { type, minutes: parsed as MeetingMinutes };
}
