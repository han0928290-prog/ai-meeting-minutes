import { isValidObjectId } from "mongoose";
import { getSessionUserId } from "@/lib/dal";
import { toMeetingDetail } from "@/lib/meeting-dto";
import { connectDB } from "@/lib/mongodb";
import { MeetingModel } from "@/models/Meeting";

// GET /api/meetings/:id — 單筆會議完整內容（只限擁有者）
export async function GET(_request: Request, ctx: RouteContext<"/api/meetings/[id]">) {
  const userId = await getSessionUserId();
  if (!userId) {
    return Response.json({ error: "請先登入" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) {
    return Response.json({ error: "找不到這筆會議紀錄" }, { status: 404 });
  }

  await connectDB();
  // 條件同時帶 userId：別人的會議與不存在的會議一律回 404，不透露是否存在
  const doc = await MeetingModel.findOne({ _id: id, userId })
    .select("-processing.speakerRefs -processing.chunks.segments")
    .lean();
  if (!doc) {
    return Response.json({ error: "找不到這筆會議紀錄" }, { status: 404 });
  }

  return Response.json(toMeetingDetail(doc));
}
