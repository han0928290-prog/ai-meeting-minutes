import { isValidObjectId } from "mongoose";
import { PipelineError, transcribeChunk } from "@/lib/chunked-transcription";
import { getSessionUserId } from "@/lib/dal";

// 一段最長 20 分鐘的錄音轉錄，通常一兩分鐘內完成
export const maxDuration = 300;

// POST /api/meetings/:id/chunks/:index — 轉錄指定的一段（index 從 0 開始）
export async function POST(_request: Request, ctx: RouteContext<"/api/meetings/[id]/chunks/[index]">) {
  const userId = await getSessionUserId();
  if (!userId) {
    return Response.json({ error: "請先登入" }, { status: 401 });
  }

  const { id, index } = await ctx.params;
  const i = Number(index);
  if (!isValidObjectId(id) || !Number.isInteger(i) || i < 0) {
    return Response.json({ error: "找不到這段錄音" }, { status: 404 });
  }

  try {
    await transcribeChunk(userId, id, i);
    return Response.json({ index: i, done: true });
  } catch (err) {
    if (err instanceof PipelineError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("Chunk transcription failed:", err);
    return Response.json({ error: "語音轉文字失敗，請稍後再試" }, { status: 500 });
  }
}
