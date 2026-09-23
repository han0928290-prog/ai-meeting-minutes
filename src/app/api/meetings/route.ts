import { getSessionUserId } from "@/lib/dal";
import { toMeetingListItem, type MeetingListItem } from "@/lib/meeting-dto";
import { connectDB } from "@/lib/mongodb";
import { MeetingModel } from "@/models/Meeting";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export type MeetingListResponse = {
  meetings: MeetingListItem[];
  page: number;
  pageSize: number;
  total: number;
};

function positiveInt(value: string | null, fallback: number) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// GET /api/meetings?page=1&pageSize=20 — 目前登入者的會議列表（新到舊）
export async function GET(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return Response.json({ error: "請先登入" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = positiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(positiveInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);

  await connectDB();
  const filter = { userId };
  const [docs, total] = await Promise.all([
    MeetingModel.find(filter)
      // 列表不需要逐字稿全文，省下傳輸量
      .select("-transcript")
      .sort({ meetingDate: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    MeetingModel.countDocuments(filter),
  ]);

  const body: MeetingListResponse = {
    meetings: docs.map(toMeetingListItem),
    page,
    pageSize,
    total,
  };
  return Response.json(body);
}
