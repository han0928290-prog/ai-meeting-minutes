import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSessionUserId } from "@/lib/dal";
import { AUDIO_EXTENSIONS, MAX_UPLOAD_BYTES, fileExtension, userAudioPrefix } from "@/lib/upload-config";

// POST /api/uploads — 發給瀏覽器一次性的上傳權杖，讓錄音檔直接傳到 Vercel Blob，
// 不經過我們的 API（部署平台對單一請求的 body 大小有限制）
export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return Response.json({ error: "請先登入" }, { status: 401 });
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // 只允許上傳到自己的資料夾、只允許音訊副檔名
        if (!pathname.startsWith(userAudioPrefix(userId)) || pathname.includes("/chunks/")) {
          throw new Error("無效的上傳路徑");
        }
        if (!AUDIO_EXTENSIONS.includes(fileExtension(pathname))) {
          throw new Error("不支援的檔案格式");
        }
        return {
          allowedContentTypes: ["audio/*", "video/mp4", "video/webm", "application/octet-stream"],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "上傳失敗" }, { status: 400 });
  }
}
