import { get } from "@vercel/blob";
import { isValidObjectId } from "mongoose";
import { BLOB_ACCESS } from "@/lib/blob";
import { getSessionUserId } from "@/lib/dal";
import { connectDB } from "@/lib/mongodb";
import { MeetingModel } from "@/models/Meeting";

// 轉發給瀏覽器的回應標頭（Range 相關標頭讓 <audio> 可以拖曳進度條）
const PASSTHROUGH_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "etag"];

// GET /api/meetings/:id/audio — 驗證擁有者後串流錄音檔，Blob 原始網址不外流
export async function GET(request: Request, ctx: RouteContext<"/api/meetings/[id]/audio">) {
  const userId = await getSessionUserId();
  if (!userId) {
    return new Response("請先登入", { status: 401 });
  }

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) {
    return new Response("找不到錄音檔", { status: 404 });
  }

  await connectDB();
  const doc = await MeetingModel.findOne({ _id: id, userId }).select("audio").lean();
  if (!doc?.audio?.url) {
    return new Response("找不到錄音檔", { status: 404 });
  }

  const range = request.headers.get("range");
  const blob = await get(doc.audio.url, {
    access: BLOB_ACCESS,
    headers: range ? { range } : undefined,
  });
  if (!blob || !blob.stream) {
    return new Response("找不到錄音檔", { status: 404 });
  }

  const headers = new Headers({ "cache-control": "private, max-age=0, must-revalidate" });
  for (const name of PASSTHROUGH_HEADERS) {
    const value = blob.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("content-type") && doc.audio.contentType) {
    headers.set("content-type", doc.audio.contentType);
  }

  return new Response(blob.stream, {
    status: headers.has("content-range") ? 206 : 200,
    headers,
  });
}
