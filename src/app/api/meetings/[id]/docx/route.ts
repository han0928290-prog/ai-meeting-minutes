import { isValidObjectId } from "mongoose";
import { getSessionUserId } from "@/lib/dal";
import { toMeetingDetail } from "@/lib/meeting-dto";
import { buildMeetingDocx, buildTranscriptDocx, docxFileName } from "@/lib/meeting-docx";
import { connectDB } from "@/lib/mongodb";
import { MeetingModel } from "@/models/Meeting";

// GET /api/meetings/:id/docx                     — 會議記錄（標題、摘要、重點、待辦；不含逐字稿）
// GET /api/meetings/:id/docx?content=transcript  — 逐字稿
export async function GET(request: Request, ctx: RouteContext<"/api/meetings/[id]/docx">) {
  const userId = await getSessionUserId();
  if (!userId) {
    return Response.json({ error: "請先登入" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) {
    return Response.json({ error: "找不到這筆會議紀錄" }, { status: 404 });
  }

  const wantsTranscript = new URL(request.url).searchParams.get("content") === "transcript";

  await connectDB();
  // 只限擁有者；會議記錄版不需要逐字稿，不必讀出來
  const doc = await MeetingModel.findOne({ _id: id, userId })
    .select(wantsTranscript ? "-processing -ai" : "-transcript -processing")
    .lean();
  if (!doc) {
    return Response.json({ error: "找不到這筆會議紀錄" }, { status: 404 });
  }

  const meeting = toMeetingDetail(doc);
  let buffer: Buffer;
  let fileName: string;

  if (wantsTranscript) {
    if (!meeting.transcript.text.trim() && meeting.transcript.segments.length === 0) {
      return Response.json({ error: "這場會議還沒有逐字稿，無法匯出" }, { status: 409 });
    }
    buffer = await buildTranscriptDocx(meeting);
    fileName = docxFileName(`${meeting.title}－逐字稿`);
  } else {
    if (!meeting.minutes) {
      return Response.json({ error: "這場會議還沒有 AI 整理結果，無法匯出" }, { status: 409 });
    }
    buffer = await buildMeetingDocx(meeting, meeting.minutes);
    fileName = docxFileName(meeting.title);
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      // filename 給舊瀏覽器（純 ASCII），filename* 帶正確的中文檔名
      "content-disposition": `attachment; filename="${wantsTranscript ? "transcript" : "meeting-minutes"}.docx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "cache-control": "private, no-store",
    },
  });
}
