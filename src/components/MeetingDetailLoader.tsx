"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import MeetingView from "@/components/MeetingView";
import ProcessingStatus from "@/components/ProcessingStatus";
import { ApiError, processMeeting, type PipelineStage } from "@/lib/meeting-pipeline";
import { Icon, buttonStyles } from "@/components/ui";
import type { MeetingDetail } from "@/lib/meeting-dto";

function Skeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className="flex flex-col gap-3">
        <span className="h-8 w-3/4 animate-pulse rounded-lg bg-surface-2" />
        <span className="flex gap-2">
          <span className="h-6 w-32 animate-pulse rounded-full bg-surface-2" />
          <span className="h-6 w-20 animate-pulse rounded-full bg-surface-2" />
        </span>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <span className="h-48 animate-pulse rounded-3xl bg-surface-2" />
        <span className="h-48 animate-pulse rounded-3xl bg-surface-2" />
      </div>
    </div>
  );
}

export default function MeetingDetailLoader({ id }: { id: string }) {
  const router = useRouter();
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/meetings/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "讀取失敗");
        if (!cancelled) setMeeting(json as MeetingDetail);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "讀取失敗");
      });
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/meetings"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
      >
        <Icon name="arrowLeft" className="size-4" />
        歷史紀錄
      </Link>
      {error && (
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-line-strong px-6 py-16 text-center">
          <Icon name="alert" className="size-6 text-muted" />
          <p className="text-sm text-muted">{error}</p>
          <Link href="/meetings" className={`${buttonStyles.secondary} ${buttonStyles.sm}`}>
            回歷史紀錄
          </Link>
        </div>
      )}
      {!error && !meeting && <Skeleton />}
      {meeting?.progress ? (
        <ResumePanel meeting={meeting} onDone={setMeeting} />
      ) : (
        meeting && <MeetingView meeting={meeting} />
      )}
    </div>
  );
}

// 處理到一半中斷的會議（例如上傳頁被關掉）：從已完成的段落接著做
function ResumePanel({ meeting, onDone }: { meeting: MeetingDetail; onDone: (m: MeetingDetail) => void }) {
  const router = useRouter();
  const [stage, setStage] = useState<PipelineStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const progress = meeting.progress!;

  async function resume() {
    setError(null);
    try {
      onDone(await processMeeting(meeting.id, progress, setStage));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return router.replace("/login");
      setError(err instanceof Error ? err.message : "處理失敗，請稍後再試");
    } finally {
      setStage(null);
    }
  }

  if (stage) {
    return (
      <div className="rounded-3xl border border-line bg-surface p-4 shadow-card sm:p-6">
        <ProcessingStatus stage={stage} title={meeting.fileName ?? meeting.title} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 rounded-3xl border border-dashed border-line-strong px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-warning-soft text-warning">
        <Icon name="clock" className="size-6" />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="text-base font-medium">這場會議還沒處理完成</p>
        <p className="text-sm text-muted">
          {meeting.fileName ?? meeting.title}・已完成 {progress.doneChunks.length} / {progress.totalChunks} 段
        </p>
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-left text-sm text-danger">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
      <button type="button" onClick={() => void resume()} className={`${buttonStyles.primary} ${buttonStyles.md}`}>
        繼續處理
        <Icon name="arrowRight" className="size-4" />
      </button>
    </div>
  );
}
