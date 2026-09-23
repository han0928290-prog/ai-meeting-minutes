// 瀏覽器端的處理流程：上傳 → 建立會議（切段）→ 轉錄各段 → 合併與 AI 整理
// 每一步都呼叫各自的 API，任何一步失敗都能從中斷處續跑（已完成的段不會重做）

import { upload } from "@vercel/blob/client";
import type { CreateMeetingResponse } from "@/app/api/meetings/route";
import type { MeetingDetail } from "@/lib/meeting-dto";
import { AUDIO_MIME_BY_EXT, BLOB_ACCESS, fileExtension, userAudioPrefix } from "@/lib/upload-config";

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

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "處理失敗，請稍後再試", res.status);
  return data as T;
}

// 伺服器錯誤或網路中斷時自動重試一次；401、4xx 這類不會因為重試而改變的錯誤直接拋出
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const retryable = !(err instanceof ApiError) || err.status >= 500;
    if (!retryable) throw err;
    await new Promise((r) => setTimeout(r, 2000));
    return fn();
  }
}

/** 瀏覽器直接把錄音檔傳到 Vercel Blob，回傳檔案網址 */
export async function uploadRecording(file: File, userId: string, onPercent: (percent: number) => void) {
  const ext = fileExtension(file.name);
  const blob = await upload(`${userAudioPrefix(userId)}${Date.now()}.${ext}`, file, {
    access: BLOB_ACCESS,
    handleUploadUrl: "/api/uploads",
    contentType: AUDIO_MIME_BY_EXT[ext],
    // 大檔分塊平行上傳，失敗的區塊會自動重傳
    multipart: file.size > 20 * 1024 * 1024,
    onUploadProgress: (e) => onPercent(e.percentage),
  });
  return blob.url;
}

export function createMeeting(blobUrl: string, fileName: string) {
  return postJson<CreateMeetingResponse>("/api/meetings", { blobUrl, fileName });
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
    await withRetry(() => postJson(`/api/meetings/${meetingId}/chunks/${index}`));
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
  return withRetry(() => postJson<MeetingDetail>(`/api/meetings/${meetingId}/finalize`));
}

/** 讀取會議目前的處理進度（續跑用） */
export async function fetchMeeting(meetingId: string): Promise<MeetingDetail> {
  const res = await fetch(`/api/meetings/${encodeURIComponent(meetingId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "讀取失敗", res.status);
  return data as MeetingDetail;
}
