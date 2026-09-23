import { isValidObjectId } from "mongoose";
import { PipelineError, finalizeMeeting } from "@/lib/chunked-transcription";
import { getSessionUserId } from "@/lib/dal";

// 長會議的逐字稿交給 AI 整理可能需要一兩分鐘
export const maxDuration = 300;

// POST /api/meetings/:id/finalize — 各段都轉錄完成後：合併逐字稿、統一講者、AI 整理
export async function POST(_request: Request, ctx: RouteContext<"/api/meetings/[id]/finalize">) {
  const userId = await getSessionUserId();
  if (!userId) {
    return Response.json({ error: "請先登入" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) {
    return Response.json({ error: "找不到這筆會議紀錄" }, { status: 404 });
  }

  try {
    return Response.json(await finalizeMeeting(userId, id));
  } catch (err) {
    if (err instanceof PipelineError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("Finalize failed:", err);
    return Response.json({ error: "會議紀錄整理失敗，請稍後再試" }, { status: 500 });
  }
}
