// 前後端共用的上傳設定（不含任何機密，可以被 client component 引用）

// 目前的 Blob store 是 public store（無法存 private）。檔名帶隨機字串難以猜測，
// 且原始網址只存在資料庫、不回傳前端，播放一律經過 /api/meetings/[id]/audio 檢查擁有者。
// 之後若改用 private store，只要把這裡改成 "private" 即可。
export const BLOB_ACCESS: "public" | "private" = "public";

// 限制單場長度與上傳大小，避免意外產生過高的 API 費用與處理時間。
// 一場會議可以有多個錄音檔（依順序接成一段），大小與長度都是全部錄音合計
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 3 * 60 * 60;
export const MAX_RECORDINGS = 10;

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

// ---------- 補充資料（簡報、圖片、文件）：和錄音一起交給 AI 整理 ----------

// image → input_image、pdf → input_file、text → 讀出文字直接放進提示
export const ATTACHMENT_KIND_BY_EXT: Record<string, { kind: "image" | "pdf" | "text"; mime: string }> = {
  png: { kind: "image", mime: "image/png" },
  jpg: { kind: "image", mime: "image/jpeg" },
  jpeg: { kind: "image", mime: "image/jpeg" },
  webp: { kind: "image", mime: "image/webp" },
  gif: { kind: "image", mime: "image/gif" },
  pdf: { kind: "pdf", mime: "application/pdf" },
  txt: { kind: "text", mime: "text/plain" },
  md: { kind: "text", mime: "text/markdown" },
  csv: { kind: "text", mime: "text/csv" },
};

export const ATTACHMENT_EXTENSIONS = Object.keys(ATTACHMENT_KIND_BY_EXT);

// 模型單次請求的檔案總量有上限，也避免費用失控
export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENTS_TOTAL_BYTES = 50 * 1024 * 1024;

/** 補充資料在 Blob 的路徑前綴（在錄音前綴底下，伺服器同樣會驗證） */
export function userAttachmentPrefix(userId: string) {
  return `${userAudioPrefix(userId)}attachments/`;
}

// ---------- 紀錄類型：決定 AI 整理的方式與輸出格式 ----------

export const NOTE_TYPES = ["meeting", "study"] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  meeting: "會議記錄",
  study: "讀書筆記",
};

export function isNoteType(value: unknown): value is NoteType {
  return typeof value === "string" && (NOTE_TYPES as readonly string[]).includes(value);
}
