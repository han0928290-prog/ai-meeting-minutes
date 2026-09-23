import type OpenAI from "openai";

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
- 講者標籤（A、B…）是自動辨識的代號，除非逐字稿中有人自我介紹或被點名，否則不要推測真實姓名。`;

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

// 有講者分段時帶上講者與時間，讓模型分得出誰說了什麼
function formatTranscript(fullText: string, segments: TranscriptLine[]) {
  if (segments.length === 0) return fullText;
  return segments
    .map((s) => `[${formatTimestamp(s.startMs)}] ${s.speaker}：${s.text}`)
    .join("\n");
}

export async function summarizeTranscript(
  openai: OpenAI,
  fullText: string,
  segments: TranscriptLine[],
): Promise<MeetingMinutes> {
  const response = await openai.responses.create({
    model: SUMMARY_MODEL,
    reasoning: { effort: "low" },
    instructions: INSTRUCTIONS,
    input: `以下是會議逐字稿：\n\n${formatTranscript(fullText, segments)}`,
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
