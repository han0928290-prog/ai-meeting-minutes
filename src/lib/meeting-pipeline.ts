// 瀏覽器端的處理流程：上傳 → 建立會議（切段）→ 轉錄各段 → 合併與 AI 整理
// 每一步都呼叫各自的 API，任何一步失敗都能從中斷處續跑（已完成的段不會重做）

import { upload } from "@vercel/blob/client";
import type { CreateMeetingResponse } from "@/app/api/meetings/route";
import type { AttachmentInput, RecordingInput } from "@/lib/chunked-transcription";
import type { MeetingDetail } from "@/lib/meeting-dto";
import {
  ATTACHMENT_KIND_BY_EXT,
  AUDIO_MIME_BY_EXT,
  BLOB_ACCESS,
  fileExtension,
  type NoteType,
  userAttachmentPrefix,
  userAudioPrefix,
} from "@/lib/upload-config";

export type PipelineStage =
  | { kind: "uploading"; percent: number }
  | { kind: "preparing" }
  | { kind: "transcribing"; done: number; total: number }
  | { kind: "summarizing" };

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// 同時轉錄的段數：太多容易撞到 OpenAI 的速率限制
const CHUNK_CONCURRENCY = 3;

// 伺服器沒有回傳錯誤訊息時（例如當機回傳 HTML 錯誤頁），依 HTTP 狀態碼說明可能的原因
function describeStatus(status: number) {
  if (status === 401) return "登入已過期，請重新登入";
  if (status === 404) return `找不到資料或 API（HTTP ${status}）`;
  if (status === 413) return `檔案或請求太大（HTTP ${status}）`;
  if (status === 429) return `請求太頻繁，請稍候再試（HTTP ${status}）`;
  if (status === 502 || status === 503 || status === 504) {
    return `伺服器暫時沒有回應，可能是處理逾時或正在重新啟動（HTTP ${status}）`;
  }
  if (status >= 500) return `伺服器內部錯誤，詳細原因請看伺服器紀錄（HTTP ${status}）`;
  return `HTTP ${status}`;
}

/** 呼叫 API；失敗時的錯誤訊息會標明是哪一步（step），以及是連線、伺服器還是請求本身的問題 */
export async function requestJson<T>(step: string, url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    // fetch 只有在連不到伺服器時才會拋錯（網路中斷、伺服器沒在執行）
    throw new ApiError(`${step}失敗：無法連線到伺服器，請確認網路連線或伺服器是否仍在執行`, 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // 伺服器自己給的訊息已經說明了原因，直接顯示
    const message = typeof data?.error === "string" ? data.error : `${step}失敗：${describeStatus(res.status)}`;
    throw new ApiError(message, res.status);
  }
  if (data === null) throw new ApiError(`${step}失敗：伺服器回應格式錯誤（HTTP ${res.status}）`, 500);
  return data as T;
}

function postJson<T>(step: string, url: string, body?: unknown): Promise<T> {
  return requestJson<T>(step, url, {
    method: "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// 伺服器錯誤或網路中斷時自動重試一次；401、4xx 這類不會因為重試而改變的錯誤直接拋出
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // status 0 是連不到伺服器
    const retryable = !(err instanceof ApiError) || err.status === 0 || err.status >= 500;
    if (!retryable) throw err;
    await new Promise((r) => setTimeout(r, 2000));
    return fn();
  }
}

async function uploadToBlob(pathname: string, file: File, contentType: string | undefined, onLoaded: (bytes: number) => void) {
  try {
    const blob = await upload(pathname, file, {
      access: BLOB_ACCESS,
      handleUploadUrl: "/api/uploads",
      contentType,
      // 大檔分塊平行上傳，失敗的區塊會自動重傳
      multipart: file.size > 20 * 1024 * 1024,
      onUploadProgress: (e) => onLoaded(e.loaded),
    });
    return blob.url;
  } catch (err) {
    // 標明是哪個檔案上傳失敗（錄音和補充資料是同時上傳的）
    const reason = err instanceof Error ? err.message.replace(/^Vercel Blob:\s*/, "") : "未知錯誤";
    throw new Error(`上傳「${file.name}」失敗：${reason}`);
  }
}

export type UploadedFiles = {
  recordings: RecordingInput[]; // 依上傳順序，伺服器會照這個順序接成一段
  attachments: AttachmentInput[];
};

/** 瀏覽器直接把錄音檔與補充資料傳到 Vercel Blob，回傳檔案網址；進度以全部檔案的總大小計算 */
export async function uploadFiles(
  recordings: File[],
  attachments: File[],
  userId: string,
  onPercent: (percent: number) => void,
): Promise<UploadedFiles> {
  const files = [...recordings, ...attachments];
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0) || 1;
  const loaded = files.map(() => 0);
  const tracker = (i: number) => (bytes: number) => {
    loaded[i] = bytes;
    onPercent(Math.min(100, (loaded.reduce((a, b) => a + b, 0) / totalBytes) * 100));
  };

  const stamp = Date.now();
  const urls = await Promise.all([
    ...recordings.map((f, i) => {
      const ext = fileExtension(f.name);
      return uploadToBlob(`${userAudioPrefix(userId)}${stamp}-${i}.${ext}`, f, AUDIO_MIME_BY_EXT[ext], tracker(i));
    }),
    ...attachments.map((f, i) => {
      const ext = fileExtension(f.name);
      return uploadToBlob(
        `${userAttachmentPrefix(userId)}${stamp}-${i}.${ext}`,
        f,
        ATTACHMENT_KIND_BY_EXT[ext]?.mime,
        tracker(recordings.length + i),
      );
    }),
  ]);
  return {
    recordings: recordings.map((f, i) => ({ blobUrl: urls[i], fileName: f.name })),
    attachments: attachments.map((f, i) => ({ blobUrl: urls[recordings.length + i], fileName: f.name })),
  };
}

export function createMeeting(uploaded: UploadedFiles, noteType: NoteType) {
  const step = uploaded.recordings.length > 1 ? "建立紀錄（合併、分析與切割錄音）" : "建立紀錄（分析與切割錄音）";
  return postJson<CreateMeetingResponse>(step, "/api/meetings", { ...uploaded, noteType });
}

/** 轉錄尚未完成的各段並整理，回傳完成的會議紀錄 */
export async function processMeeting(
  meetingId: string,
  progress: { totalChunks: number; doneChunks: number[] },
  onStage: (stage: PipelineStage) => void,
): Promise<MeetingDetail> {
  const total = progress.totalChunks;
  const done = new Set(progress.doneChunks);
  const report = () => onStage({ kind: "transcribing", done: done.size, total });

  const run = async (index: number) => {
    await withRetry(() => postJson(`第 ${index + 1} 段語音轉文字`, `/api/meetings/${meetingId}/chunks/${index}`));
    done.add(index);
    report();
  };

  report();
  // 第 1 段要先完成：它會產生講者聲音樣本，其餘各段靠它對應成同一位講者
  if (total > 0 && !done.has(0)) await run(0);

  const queue = Array.from({ length: total }, (_, i) => i).filter((i) => !done.has(i));
  await Promise.all(
    Array.from({ length: Math.min(CHUNK_CONCURRENCY, queue.length) }, async () => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) await run(i);
    }),
  );

  onStage({ kind: "summarizing" });
  return withRetry(() => postJson<MeetingDetail>("合併逐字稿與 AI 整理", `/api/meetings/${meetingId}/finalize`));
}

/** 讀取單筆會議（含處理進度，續跑也用這個） */
export function fetchMeeting(meetingId: string): Promise<MeetingDetail> {
  return requestJson<MeetingDetail>("讀取會議紀錄", `/api/meetings/${encodeURIComponent(meetingId)}`);
}
