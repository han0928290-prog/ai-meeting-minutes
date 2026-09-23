import "server-only";
import { del, put } from "@vercel/blob";

// 目前的 Blob store 是 public store（無法存 private）。檔名帶隨機字串難以猜測，
// 且原始網址只存在資料庫、不回傳前端，播放一律經過 /api/meetings/[id]/audio 檢查擁有者。
// 之後若改用 private store，只要把這裡改成 "private" 即可。
export const BLOB_ACCESS: "public" | "private" = "public";

// 瀏覽器有時不帶或只帶 application/octet-stream，改用副檔名判斷，<audio> 才播得了
const AUDIO_MIME_BY_EXT: Record<string, string> = {
  flac: "audio/flac",
  mp3: "audio/mpeg",
  mpeg: "audio/mpeg",
  mpga: "audio/mpeg",
  mp4: "audio/mp4",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  wav: "audio/wav",
  webm: "audio/webm",
};

export async function uploadMeetingAudio(userId: string, file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const contentType =
    file.type && file.type !== "application/octet-stream" ? file.type : AUDIO_MIME_BY_EXT[ext];
  return put(`meetings/${userId}/${Date.now()}.${ext}`, file, {
    access: BLOB_ACCESS,
    addRandomSuffix: true,
    contentType,
  });
}

export async function deleteBlobQuietly(url: string) {
  try {
    await del(url);
  } catch (err) {
    console.error("Failed to delete blob:", url, err);
  }
}
