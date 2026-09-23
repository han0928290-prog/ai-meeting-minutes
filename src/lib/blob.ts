import "server-only";
import { del } from "@vercel/blob";
import { AUDIO_MIME_BY_EXT, fileExtension } from "@/lib/upload-config";

export { BLOB_ACCESS } from "@/lib/upload-config";

/** 決定錄音檔的 content-type：優先用上傳時帶的，沒有或無意義時改用副檔名判斷 */
export function audioContentType(pathname: string, reported?: string | null) {
  if (reported && reported !== "application/octet-stream") return reported;
  return AUDIO_MIME_BY_EXT[fileExtension(pathname)] ?? "application/octet-stream";
}

export async function deleteBlobQuietly(url: string) {
  try {
    await del(url);
  } catch (err) {
    console.error("Failed to delete blob:", url, err);
  }
}
