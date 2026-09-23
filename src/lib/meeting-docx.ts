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
import type { MeetingDetail } from "@/lib/meeting-dto";
import type { MeetingMinutes } from "@/lib/summarize";

// 會議記錄 Word 檔：標題、會議資訊、摘要、重點、待辦事項（不含逐字稿）

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

export async function buildMeetingDocx(meeting: MeetingDetail, minutes: MeetingMinutes): Promise<Buffer> {
  const meta = [
    `日期：${formatDate(meeting.meetingDate)}`,
    meeting.durationSeconds != null ? `長度：${formatDuration(meeting.durationSeconds)}` : null,
    meeting.fileName ? `錄音檔：${meeting.fileName}` : null,
  ].filter((s): s is string => Boolean(s));

  const doc = new Document({
    title: meeting.title,
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
        properties: {
          page: { margin: { top: 1300, bottom: 1300, left: 1300, right: 1300 } },
        },
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(meeting.title)] }),
          new Paragraph({
            spacing: { after: 240 },
            children: [new TextRun({ text: meta.join("　｜　"), color: MUTED, size: 20 })],
          }),

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

          new Paragraph({
            spacing: { before: 480 },
            children: [new TextRun({ text: "本會議記錄由 AI 根據錄音自動整理，重要內容請與原始錄音核對。", color: MUTED, size: 18 })],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

/** 下載用檔名：去掉檔名不允許的字元 */
export function docxFileName(title: string) {
  const safe = title.replace(/[\\/:*?"<>|\r\n]+/g, " ").trim().slice(0, 80) || "會議記錄";
  return `${safe}.docx`;
}
