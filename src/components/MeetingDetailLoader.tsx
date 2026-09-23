"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import MeetingView from "@/components/MeetingView";
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
      {meeting && <MeetingView meeting={meeting} />}
    </div>
  );
}
