import "server-only";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { MeetingDetail, TranscriptSegment } from "@/lib/meeting-dto";
import type { MeetingMinutes } from "@/lib/summarize";

// 會議的 Word 檔：會議記錄（摘要、重點、待辦）與逐字稿兩種

// 中文用微軟正黑體，英數用 Calibri；沒有這些字型的電腦（例如 Mac）Word 會自動替換
const FONT = { ascii: "Calibri", hAnsi: "Calibri", eastAsia: "Microsoft JhengHei", cs: "Calibri" };
const INK = "16161A";
const MUTED = "6B6A66";
const ACCENT = "3A4FE0";
const LINE = "D9D7D0";
const HEADER_FILL = "F0EEE8";

// 伺服器可能跑在 UTC 時區，日期一律以台灣時間顯示
function formatDate(iso: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function formatDuration(seconds: number) {
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${Math.max(1, m)} 分鐘`;
  return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分鐘`;
}

function heading(text: string) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}

function cellBorders() {
  const b = { style: BorderStyle.SINGLE, size: 4, color: LINE };
  return { top: b, bottom: b, left: b, right: b };
}

function cell(text: string, opts: { header?: boolean; width: number; muted?: boolean }) {
  return new TableCell({
    width: { size: opts.width, type: WidthType.PERCENTAGE },
    borders: cellBorders(),
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    shading: opts.header ? { type: ShadingType.CLEAR, color: "auto", fill: HEADER_FILL } : undefined,
    children: [
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text, bold: opts.header, color: opts.muted ? MUTED : INK })],
      }),
    ],
  });
}

function actionItemsTable(items: MeetingMinutes["actionItems"]) {
  const widths = [60, 20, 20];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: ["項目", "負責人", "期限"].map((t, i) => cell(t, { header: true, width: widths[i] })),
      }),
      ...items.map(
        (a) =>
          new TableRow({
            children: [
              cell(a.task, { width: widths[0] }),
              cell(a.owner ?? "未指定", { width: widths[1], muted: !a.owner }),
              cell(a.due ?? "未提及", { width: widths[2], muted: !a.due }),
            ],
          }),
      ),
    ],
  });
}

function metaLine(meeting: MeetingDetail, extra: (string | null)[] = []) {
  const parts = [
    `日期：${formatDate(meeting.meetingDate)}`,
    meeting.durationSeconds != null ? `長度：${formatDuration(meeting.durationSeconds)}` : null,
    ...extra,
    meeting.fileName ? `錄音檔：${meeting.fileName}` : null,
  ].filter((s): s is string => Boolean(s));
  return new Paragraph({
    spacing: { after: 240 },
    children: [new TextRun({ text: parts.join("　｜　"), color: MUTED, size: 20 })],
  });
}

function footnote(text: string) {
  return new Paragraph({ spacing: { before: 480 }, children: [new TextRun({ text, color: MUTED, size: 18 })] });
}

// 兩種 Word 檔共用的文件設定：字型、標題樣式、頁邊距
function createDocument(title: string, children: (Paragraph | Table)[]) {
  return new Document({
    title,
    creator: "AI 會議記錄",
    description: "由 AI 會議記錄自動產生",
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 22, color: INK }, // 11pt
          paragraph: { spacing: { line: 360, after: 120 } }, // 1.5 倍行距
        },
        title: {
          run: { font: FONT, size: 40, bold: true, color: INK },
          paragraph: { spacing: { after: 120 } },
        },
        heading1: {
          run: { font: FONT, size: 28, bold: true, color: ACCENT },
          paragraph: {
            spacing: { before: 360, after: 160 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 4 } },
          },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "key-points",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 440, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1300, bottom: 1300, left: 1300, right: 1300 } } },
        children: [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] }), ...children],
      },
    ],
  });
}

/** 會議記錄：標題、會議資訊、摘要、重點、待辦事項（不含逐字稿） */
export async function buildMeetingDocx(meeting: MeetingDetail, minutes: MeetingMinutes): Promise<Buffer> {
  const doc = createDocument(meeting.title, [
    metaLine(meeting),

    heading("摘要"),
    new Paragraph({ children: [new TextRun(minutes.summary)] }),

    heading("重點"),
    ...(minutes.keyPoints.length > 0
      ? minutes.keyPoints.map(
          (p) => new Paragraph({ numbering: { reference: "key-points", level: 0 }, children: [new TextRun(p)] }),
        )
      : [new Paragraph({ children: [new TextRun({ text: "沒有整理出重點", color: MUTED })] })]),

    heading("待辦事項"),
    ...(minutes.actionItems.length > 0
      ? [actionItemsTable(minutes.actionItems)]
      : [new Paragraph({ children: [new TextRun({ text: "會議中沒有提到待辦事項", color: MUTED })] })]),

    footnote("本會議記錄由 AI 根據錄音自動整理，重要內容請與原始錄音核對。"),
  ]);
  return Packer.toBuffer(doc);
}

function formatTimestamp(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mmss = `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
}

// 同一位講者連續的發言合併成一段，閱讀起來比較順
function groupBySpeaker(segments: TranscriptSegment[]) {
  const groups: { speaker: string; startMs: number; texts: string[] }[] = [];
  for (const s of segments) {
    const last = groups.at(-1);
    if (last && last.speaker === s.speaker) last.texts.push(s.text);
    else groups.push({ speaker: s.speaker, startMs: s.startMs, texts: [s.text] });
  }
  return groups;
}

// 中文句子之間不加空格，英文句子之間補一個空格
function joinSentences(texts: string[]) {
  return texts.reduce((acc, t) => {
    if (!acc) return t;
    const cjkBoundary = /[　-〿一-鿿＀-￯]$/.test(acc) || /^[　-〿一-鿿＀-￯]/.test(t);
    return acc + (cjkBoundary ? "" : " ") + t;
  }, "");
}

/** 逐字稿：標題、會議資訊、依講者分段並標上時間的完整逐字稿 */
export async function buildTranscriptDocx(meeting: MeetingDetail): Promise<Buffer> {
  const { segments, text } = meeting.transcript;
  const speakerCount = new Set(segments.map((s) => s.speaker)).size;

  const body =
    segments.length > 0
      ? groupBySpeaker(segments).map(
          (g) =>
            new Paragraph({
              spacing: { after: 160 },
              children: [
                new TextRun({ text: `[${formatTimestamp(g.startMs)}]  `, color: MUTED, size: 20 }),
                new TextRun({ text: `講者 ${g.speaker}：`, bold: true, color: ACCENT }),
                new TextRun(joinSentences(g.texts)),
              ],
            }),
        )
      : text
          .split(/\n+/)
          .filter((line) => line.trim())
          .map((line) => new Paragraph({ children: [new TextRun(line)] }));

  const doc = createDocument(meeting.title, [
    metaLine(meeting, [speakerCount > 0 ? `講者：${speakerCount} 位` : null]),
    heading("逐字稿"),
    ...body,
    footnote("本逐字稿由語音辨識自動產生，可能有錯字或講者標示錯誤，引用前請與原始錄音核對。"),
  ]);
  return Packer.toBuffer(doc);
}

/** 下載用檔名：去掉檔名不允許的字元 */
export function docxFileName(title: string) {
  const safe = title.replace(/[\\/:*?"<>|\r\n]+/g, " ").trim().slice(0, 80) || "會議記錄";
  return `${safe}.docx`;
}
