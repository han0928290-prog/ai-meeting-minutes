import { PipelineError, prepareMeeting, unexpectedErrorMessage } from "@/lib/chunked-transcription";
import { getSessionUserId } from "@/lib/dal";
import { toMeetingListItem, type MeetingListItem } from "@/lib/meeting-dto";
import { connectDB } from "@/lib/mongodb";
import { isNoteType } from "@/lib/upload-config";
import { MeetingModel } from "@/models/Meeting";

// 建立會議需要下載原始錄音、偵測靜音並切段，長錄音可能要一兩分鐘
export const maxDuration = 300;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export type MeetingListResponse = {
  meetings: MeetingListItem[];
  page: number;
  pageSize: number;
  total: number;
};

function positiveInt(value: string | null, fallback: number) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// GET /api/meetings?page=1&pageSize=20 — 目前登入者的會議列表（新到舊）
export async function GET(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return Response.json({ error: "請先登入" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = positiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(positiveInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);

  await connectDB();
  const filter = { userId };
  const [docs, total] = await Promise.all([
    MeetingModel.find(filter)
      // 列表不需要逐字稿全文與處理中的暫存資料，省下傳輸量
      .select("-transcript -processing")
      .sort({ meetingDate: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    MeetingModel.countDocuments(filter),
  ]);

  const body: MeetingListResponse = {
    meetings: docs.map(toMeetingListItem),
    page,
    pageSize,
    total,
  };
  return Response.json(body);
}

export type CreateMeetingResponse = {
  meetingId: string;
  totalChunks: number;
  durationSeconds: number;
};

type UploadedFile = { blobUrl: string; fileName: string };

function isFileList(value: unknown): value is UploadedFile[] {
  return (
    Array.isArray(value) &&
    value.every((f) => typeof f?.blobUrl === "string" && typeof f.fileName === "string" && f.fileName.trim() !== "")
  );
}

const trimFileName = (f: UploadedFile) => ({ blobUrl: f.blobUrl, fileName: f.fileName.trim().slice(0, 200) });

// POST /api/meetings — 錄音檔（可多個，依順序接續）與補充資料已由瀏覽器直接上傳到 Blob，
// 這裡驗證檔案、合併、切段並建立會議紀錄。
// 之後由前端依序呼叫 /chunks/:index 轉錄各段，最後呼叫 /finalize
export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return Response.json({ error: "請先登入" }, { status: 401 });
  }

  const input = (await request.json().catch(() => null)) as {
    noteType?: unknown;
    recordings?: unknown;
    attachments?: unknown;
  } | null;
  const noteType = input?.noteType ?? "meeting";
  const recordings = input?.recordings;
  const attachments = input?.attachments ?? [];
  if (!isNoteType(noteType) || !isFileList(recordings) || recordings.length === 0 || !isFileList(attachments)) {
    return Response.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  try {
    const body: CreateMeetingResponse = await prepareMeeting(userId, {
      noteType,
      recordings: recordings.map(trimFileName),
      attachments: attachments.map(trimFileName),
    });
    return Response.json(body, { status: 201 });
  } catch (err) {
    if (err instanceof PipelineError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("Create meeting failed:", err);
    return Response.json({ error: unexpectedErrorMessage("建立會議", err) }, { status: 500 });
  }
}
