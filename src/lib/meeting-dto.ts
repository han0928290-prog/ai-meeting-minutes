import type { Types } from "mongoose";
import type { Meeting, MeetingStatus } from "@/models/Meeting";
import type { MeetingMinutes } from "@/lib/summarize";

// API 回傳給前端的會議資料格式。刻意不包含 userId 與 Blob 原始網址

export type TranscriptSegment = {
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type MeetingListItem = {
  id: string;
  title: string;
  meetingDate: string;
  durationSeconds: number | null;
  status: MeetingStatus;
  summary: string | null;
  actionItemCount: number;
  hasAudio: boolean;
};

export type MeetingDetail = {
  id: string;
  title: string;
  meetingDate: string;
  durationSeconds: number | null;
  status: MeetingStatus;
  fileName: string | null;
  audioUrl: string | null; // 本站 API 路徑，會驗證擁有者後才串流錄音檔
  transcript: { text: string; segments: TranscriptSegment[] };
  minutes: MeetingMinutes | null;
  errorMessage: string | null;
  // 分段轉錄尚未完成時才有值，前端用來顯示進度與續跑
  progress: { totalChunks: number; doneChunks: number[] } | null;
};

type MeetingDoc = Meeting & { _id: Types.ObjectId };

export function audioApiPath(id: string) {
  return `/api/meetings/${id}/audio`;
}

export function toMeetingListItem(doc: MeetingDoc): MeetingListItem {
  const id = String(doc._id);
  return {
    id,
    title: doc.title,
    meetingDate: new Date(doc.meetingDate ?? doc.createdAt).toISOString(),
    durationSeconds: doc.durationSeconds ?? null,
    status: doc.status,
    summary: doc.ai?.summary ?? null,
    actionItemCount: doc.ai?.actionItems?.length ?? 0,
    hasAudio: Boolean(doc.audio?.url),
  };
}

export function toMeetingDetail(doc: MeetingDoc): MeetingDetail {
  const id = String(doc._id);
  const ai = doc.ai;
  return {
    id,
    title: doc.title,
    meetingDate: new Date(doc.meetingDate ?? doc.createdAt).toISOString(),
    durationSeconds: doc.durationSeconds ?? null,
    status: doc.status,
    fileName: doc.source?.fileName ?? null,
    audioUrl: doc.audio?.url ? audioApiPath(id) : null,
    transcript: {
      text: doc.transcript?.fullText ?? "",
      segments: (doc.transcript?.segments ?? []).map((s) => ({
        speaker: s.speaker ?? "",
        startMs: s.startMs ?? 0,
        endMs: s.endMs ?? 0,
        text: s.text,
      })),
    },
    minutes:
      ai?.summary != null
        ? {
            title: doc.title,
            summary: ai.summary,
            keyPoints: ai.keyPoints ?? [],
            actionItems: (ai.actionItems ?? []).map((a) => ({
              task: a.task,
              owner: a.owner ?? null,
              due: a.due ?? null,
            })),
          }
        : null,
    errorMessage: doc.errorMessage ?? null,
    progress: doc.processing
      ? {
          totalChunks: doc.processing.chunks.length,
          doneChunks: doc.processing.chunks.flatMap((c, i) => (c.status === "done" ? [i] : [])),
        }
      : null,
  };
}
