import type { Types } from "mongoose";
import type { Meeting, MeetingStatus } from "@/models/Meeting";
import type { MeetingMinutes, StudyNotes } from "@/lib/summarize";
import type { NoteType } from "@/lib/upload-config";

// API 回傳給前端的會議資料格式。刻意不包含 userId 與 Blob 原始網址

export type TranscriptSegment = {
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
};

/** 多個錄音檔接成一場會議時，每個檔案在時間軸上的起點 */
export type RecordingPart = { fileName: string; startMs: number };

/**
 * 找出每個錄音檔（第 2 個起）從逐字稿的哪一段開始，回傳「段落索引 → 錄音檔索引」。
 * 逐字稿顯示與交給 AI 整理時，用來在這些位置標示「第幾個錄音檔」
 */
export function recordingStarts(segments: { startMs: number }[], recordings: RecordingPart[]) {
  const starts = new Map<number, number>();
  for (const [r, rec] of recordings.entries()) {
    if (r === 0) continue;
    const i = segments.findIndex((s) => s.startMs >= rec.startMs);
    if (i >= 0 && !starts.has(i)) starts.set(i, r);
  }
  return starts;
}

export type MeetingListItem = {
  id: string;
  title: string;
  noteType: NoteType;
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
  noteType: NoteType;
  meetingDate: string;
  durationSeconds: number | null;
  status: MeetingStatus;
  fileName: string | null;
  // 上傳多個錄音檔時才有，依上傳順序
  recordings: RecordingPart[] | null;
  audioUrl: string | null; // 本站 API 路徑，會驗證擁有者後才串流錄音檔
  transcript: { text: string; segments: TranscriptSegment[] };
  // AI 整理結果：會議記錄填 minutes、讀書筆記填 notes，另一個是 null
  minutes: MeetingMinutes | null;
  notes: StudyNotes | null;
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
    noteType: doc.noteType ?? "meeting",
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
  const noteType = doc.noteType ?? "meeting";
  return {
    id,
    title: doc.title,
    noteType,
    meetingDate: new Date(doc.meetingDate ?? doc.createdAt).toISOString(),
    durationSeconds: doc.durationSeconds ?? null,
    status: doc.status,
    fileName: doc.source?.fileName ?? null,
    recordings: doc.recordings?.length ? doc.recordings.map((r) => ({ fileName: r.fileName, startMs: r.startMs })) : null,
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
    notes:
      noteType === "study" && ai?.summary != null
        ? {
            title: doc.title,
            summary: ai.summary,
            sections: (ai.sections ?? []).map((s) => ({ heading: s.heading, points: s.points ?? [] })),
            terms: (ai.terms ?? []).map((t) => ({ term: t.term, definition: t.definition })),
            examples: ai.examples ?? [],
          }
        : null,
    minutes:
      noteType === "meeting" && ai?.summary != null
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
