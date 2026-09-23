"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { MeetingListResponse } from "@/app/api/meetings/route";
import { formatTime } from "@/components/MeetingView";
import { Icon, buttonStyles } from "@/components/ui";

function DateBlock({ iso }: { iso: string }) {
  const d = new Date(iso);
  return (
    <span className="flex w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-surface-2 py-2 sm:w-16">
      <span className="text-[11px] font-medium text-muted">{d.getMonth() + 1} 月</span>
      <span className="text-xl leading-tight font-semibold tabular-nums sm:text-2xl">{d.getDate()}</span>
    </span>
  );
}

function Skeleton() {
  return (
    <ul className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="flex gap-4 rounded-3xl border border-line bg-surface p-4 sm:p-5">
          <span className="h-16 w-14 animate-pulse rounded-2xl bg-surface-2 sm:w-16" />
          <span className="flex flex-1 flex-col gap-2.5 pt-1">
            <span className="h-4 w-2/3 animate-pulse rounded bg-surface-2" />
            <span className="h-3 w-1/3 animate-pulse rounded bg-surface-2" />
            <span className="h-3 w-full animate-pulse rounded bg-surface-2" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function MeetingHistory() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<MeetingListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/meetings?page=${page}`)
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "讀取失敗");
        if (!cancelled) setData(json as MeetingListResponse);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "讀取失敗");
      });
    return () => {
      cancelled = true;
    };
  }, [page, router]);

  if (error) {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-2xl bg-danger-soft p-4 text-sm text-danger">
        <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
        {error}
      </p>
    );
  }
  if (!data) return <Skeleton />;

  if (data.total === 0) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-3xl border border-dashed border-line-strong px-6 py-16 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Icon name="mic" className="size-6" />
        </span>
        <div className="flex flex-col gap-1.5">
          <p className="text-base font-medium">還沒有會議紀錄</p>
          <p className="text-sm text-muted">上傳第一場會議錄音，幾分鐘後就會出現在這裡。</p>
        </div>
        <Link href="/new" className={`${buttonStyles.primary} ${buttonStyles.md}`}>
          <Icon name="upload" className="size-4" />
          上傳錄音
        </Link>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">共 {data.total} 場會議</p>
      <ul className="flex flex-col gap-3">
        {data.meetings.map((m) => (
          <li key={m.id}>
            <Link
              href={`/meetings/${m.id}`}
              className="group flex gap-4 rounded-3xl border border-line bg-surface p-4 shadow-card transition-[border-color,transform] hover:-translate-y-0.5 hover:border-accent/40 sm:p-5"
            >
              <DateBlock iso={m.meetingDate} />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex items-start justify-between gap-3">
                  <span className="line-clamp-2 font-semibold text-pretty sm:line-clamp-1">{m.title}</span>
                  <Icon
                    name="arrowRight"
                    className="mt-0.5 hidden size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent sm:block"
                  />
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span>
                    {new Date(m.meetingDate).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {m.durationSeconds != null && (
                    <span className="inline-flex items-center gap-1">
                      <Icon name="clock" className="size-3" />
                      {formatTime(m.durationSeconds * 1000)}
                    </span>
                  )}
                  {m.actionItemCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-accent">
                      <Icon name="checkCircle" className="size-3" />
                      {m.actionItemCount} 項待辦
                    </span>
                  )}
                  {!m.hasAudio && <span>無錄音檔</span>}
                  {(m.status === "transcribing" || m.status === "summarizing") && (
                    <span className="text-warning">尚未處理完成</span>
                  )}
                  {m.status === "transcribed" && <span className="text-warning">AI 整理未完成</span>}
                </span>
                {m.summary && (
                  <span className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-muted">{m.summary}</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <nav aria-label="分頁" className="flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className={`${buttonStyles.secondary} ${buttonStyles.sm}`}
          >
            <Icon name="arrowLeft" className="size-4" />
            上一頁
          </button>
          <span className="min-w-14 text-center text-muted tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className={`${buttonStyles.secondary} ${buttonStyles.sm}`}
          >
            下一頁
            <Icon name="arrowRight" className="size-4" />
          </button>
        </nav>
      )}
    </div>
  );
}
