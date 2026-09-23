"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import MeetingView from "@/components/MeetingView";
import ProcessingStatus from "@/components/ProcessingStatus";
import { Icon, buttonStyles, type IconName } from "@/components/ui";
import type { MeetingDetail } from "@/lib/meeting-dto";
import {
  ApiError,
  createMeeting,
  fetchMeeting,
  processMeeting,
  uploadRecording,
  type PipelineStage,
} from "@/lib/meeting-pipeline";
import { AUDIO_EXTENSIONS, MAX_AUDIO_SECONDS, MAX_UPLOAD_BYTES, fileExtension } from "@/lib/upload-config";

const ACCEPT = `${AUDIO_EXTENSIONS.map((e) => `.${e}`).join(",")},audio/*`;
const MAX_FILE_MB = MAX_UPLOAD_BYTES / 1024 / 1024;
const MAX_HOURS = MAX_AUDIO_SECONDS / 3600;
const DELIVERABLES: { icon: IconName; title: string; desc: string }[] = [
  { icon: "users", title: "分講者的逐字稿", desc: "附時間軸，點一下就能從那裡回放" },
  { icon: "sparkles", title: "摘要與重點", desc: "三十秒掌握整場會議" },
  { icon: "checkCircle", title: "待辦事項", desc: "整理出負責人與期限" },
  { icon: "shield", title: "只有你看得到", desc: "錄音與紀錄只屬於你的帳號" },
];

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

// 處理中離開頁面前提醒（已完成的段落會保留，但要回到歷史紀錄手動續跑）
function useLeaveWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);
}

export default function AudioUploader({ userId }: { userId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<PipelineStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MeetingDetail | null>(null);
  // 會議紀錄已建立後才失敗：重試時從這筆紀錄續跑，不用重新上傳
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const loading = stage !== null;
  useLeaveWarning(loading);

  function selectFile(selected: File | null) {
    setResult(null);
    setError(null);
    setMeetingId(null);
    if (!selected) return setFile(null);
    if (!AUDIO_EXTENSIONS.includes(fileExtension(selected.name))) {
      setFile(null);
      return setError(`不支援的格式，請上傳 ${AUDIO_EXTENSIONS.join("、").toUpperCase()} 檔`);
    }
    if (selected.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      return setError(`音檔超過 ${MAX_FILE_MB}MB 上限`);
    }
    setFile(selected);
  }

  function clearFile() {
    setFile(null);
    setError(null);
    setMeetingId(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function startOver() {
    setResult(null);
    clearFile();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (loading) return;
    selectFile(e.dataTransfer.files?.[0] ?? null);
  }

  async function run() {
    if (!file) return;
    setError(null);
    setResult(null);

    try {
      let id = meetingId;
      let progress: { totalChunks: number; doneChunks: number[] };

      if (id) {
        // 續跑：以伺服器上的實際進度為準
        setStage({ kind: "transcribing", done: 0, total: 0 });
        const current = await fetchMeeting(id);
        if (!current.progress) {
          setResult(current);
          return;
        }
        progress = current.progress;
      } else {
        setStage({ kind: "uploading", percent: 0 });
        const blobUrl = await uploadRecording(file, userId, (percent) =>
          setStage({ kind: "uploading", percent }),
        );
        setStage({ kind: "preparing" });
        const created = await createMeeting(blobUrl, file.name);
        id = created.meetingId;
        setMeetingId(id);
        progress = { totalChunks: created.totalChunks, doneChunks: [] };
      }

      setResult(await processMeeting(id, progress, setStage));
      setMeetingId(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "處理失敗，請稍後再試");
    } finally {
      setStage(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void run();
  }

  if (result) {
    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4 rounded-2xl border border-success/25 bg-success-soft p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <Icon name="checkCircle" className="mt-0.5 size-5 shrink-0 text-success" />
            <p className="text-sm font-medium">會議記錄完成，已保存到歷史紀錄</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={startOver}
              className={`${buttonStyles.secondary} ${buttonStyles.sm} flex-1 sm:flex-none`}
            >
              <Icon name="plus" className="size-4" />
              再上傳一場
            </button>
            <Link href={`/meetings/${result.id}`} className={`${buttonStyles.dark} ${buttonStyles.sm} flex-1 sm:flex-none`}>
              開啟紀錄
              <Icon name="arrowRight" className="size-4" />
            </Link>
          </div>
        </div>
        <MeetingView meeting={result} />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 rounded-3xl border border-line bg-surface p-4 shadow-card sm:p-6"
      >
        {stage ? (
          <ProcessingStatus stage={stage} title={file?.name ?? ""} />
        ) : (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`group relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-4 py-12 text-center transition-colors sm:py-16 ${
              dragging
                ? "border-accent bg-accent-soft"
                : "border-line-strong bg-surface-2/50 hover:border-accent/60 hover:bg-accent-soft/60"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
            <span className="grid size-14 place-items-center rounded-2xl bg-surface text-accent shadow-card transition-transform group-hover:-translate-y-0.5">
              <Icon name="upload" className="size-6" />
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-base font-medium">
                <span className="hidden sm:inline">拖曳錄音檔到這裡，或</span>
                <span className="text-accent underline decoration-accent/30 underline-offset-4">選擇檔案</span>
              </span>
              <span className="text-sm text-muted">
                MP3、M4A、WAV、WEBM 等格式，最長 {MAX_HOURS} 小時、{MAX_FILE_MB}MB 以內
              </span>
            </span>
          </label>
        )}

        {file && !loading && (
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2/60 p-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <Icon name="file" className="size-5" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{file.name}</span>
              <span className="text-xs text-muted">{formatSize(file.size)}</span>
            </span>
            <button
              type="button"
              onClick={clearFile}
              aria-label="移除檔案"
              className={`${buttonStyles.ghost} size-9 shrink-0`}
            >
              <Icon name="x" className="size-4" />
            </button>
          </div>
        )}

        {error && (
          <div role="alert" className="flex flex-col gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger">
            <p className="flex items-start gap-2">
              <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
            {meetingId && <p className="pl-6 text-xs">已完成的部分都保留著，按「重試」會從中斷的地方繼續。</p>}
          </div>
        )}

        <button
          type="submit"
          disabled={!file || loading}
          className={`${buttonStyles.primary} ${buttonStyles.lg} w-full sm:w-auto sm:self-end`}
        >
          {loading ? "處理中…" : meetingId ? "重試" : "產生會議記錄"}
          {!loading && <Icon name="arrowRight" className="size-4" />}
        </button>
      </form>

      <aside className="flex flex-col gap-4 rounded-3xl border border-line bg-surface-2/50 p-5 sm:p-6">
        <h2 className="text-sm font-semibold">完成後你會拿到</h2>
        <ul className="flex flex-col gap-3.5 text-sm">
          {DELIVERABLES.map((item) => (
            <li key={item.title} className="flex gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface text-accent shadow-card">
                <Icon name={item.icon} className="size-4" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{item.title}</span>
                <span className="text-muted">{item.desc}</span>
              </span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
