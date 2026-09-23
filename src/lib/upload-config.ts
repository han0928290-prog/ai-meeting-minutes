// 前後端共用的上傳設定（不含任何機密，可以被 client component 引用）

// 目前的 Blob store 是 public store（無法存 private）。檔名帶隨機字串難以猜測，
// 且原始網址只存在資料庫、不回傳前端，播放一律經過 /api/meetings/[id]/audio 檢查擁有者。
// 之後若改用 private store，只要把這裡改成 "private" 即可。
export const BLOB_ACCESS: "public" | "private" = "public";

// 限制單場長度與上傳大小，避免意外產生過高的 API 費用與處理時間
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 3 * 60 * 60;

// 瀏覽器有時不帶或只帶 application/octet-stream，改用副檔名判斷，<audio> 才播得了
export const AUDIO_MIME_BY_EXT: Record<string, string> = {
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

export const AUDIO_EXTENSIONS = Object.keys(AUDIO_MIME_BY_EXT);

export function fileExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/** 原始錄音檔在 Blob 的路徑前綴；伺服器會驗證上傳路徑必須在這底下 */
export function userAudioPrefix(userId: string) {
  return `meetings/${userId}/`;
}
