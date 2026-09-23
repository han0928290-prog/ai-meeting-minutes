"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { TranscribeResponse } from "@/app/api/transcribe/route";
import MeetingView from "@/components/MeetingView";
import { Icon, buttonStyles, type IconName } from "@/components/ui";

const MAX_FILE_MB = 25;
const ACCEPT = ".flac,.mp3,.mp4,.mpeg,.mpga,.m4a,.ogg,.wav,.webm,audio/*";
const STEPS = ["上傳錄音檔", "語音轉文字、辨識講者", "AI 整理摘要與待辦", "保存到歷史紀錄"];
const DELIVERABLES: { icon: IconName; title: string; desc: string }[] = [
  { icon: "users", title: "分講者的逐字稿", desc: "附時間軸，點一下就能從那裡回放" },
  { icon: "sparkles", title: "摘要與重點", desc: "三十秒掌握整場會議" },
  { icon: "checkCircle", title: "待辦事項", desc: "整理出負責人與期限" },
  { icon: "shield", title: "只有你看得到", desc: "錄音與紀錄只屬於你的帳號" },
];

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

// 處理中顯示實際經過秒數（API 是單一請求，無法得知真實進度，所以不做假進度條）
function useElapsedSeconds(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => {
      clearInterval(timer);
      setSeconds(0);
    };
  }, [running]);
  return seconds;
}

export default function AudioUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TranscribeResponse | null>(null);
  const elapsed = useElapsedSeconds(loading);

  function selectFile(selected: File | null) {
    setResult(null);
    setError(null);
    if (selected && selected.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`音檔超過 ${MAX_FILE_MB}MB 上限`);
      setFile(null);
      return;
    }
    setFile(selected);
  }

  function clearFile() {
    setFile(null);
    setError(null);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/transcribe", { method: "POST", body: formData });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "上傳失敗");
      setResult(data as TranscribeResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上傳失敗");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4 rounded-2xl border border-success/25 bg-success-soft p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <Icon name="checkCircle" className="mt-0.5 size-5 shrink-0 text-success" />
            <div className="flex flex-col gap-1 text-sm">
              <p className="font-medium">會議記錄完成，已保存到歷史紀錄</p>
              {result.warnings.map((w) => (
                <p key={w} className="text-warning">
                  {w}
                </p>
              ))}
            </div>
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
            <Link href={`/meetings/${result.meeting.id}`} className={`${buttonStyles.dark} ${buttonStyles.sm} flex-1 sm:flex-none`}>
              開啟紀錄
              <Icon name="arrowRight" className="size-4" />
            </Link>
          </div>
        </div>
        <MeetingView meeting={result.meeting} />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 rounded-3xl border border-line bg-surface p-4 shadow-card sm:p-6"
      >
        {loading ? (
          <ProcessingPanel fileName={file?.name ?? ""} elapsed={elapsed} />
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
              <span className="text-sm text-muted">MP3、M4A、WAV、WEBM 等格式，單檔上限 {MAX_FILE_MB}MB</span>
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
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger">
            <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!file || loading}
          className={`${buttonStyles.primary} ${buttonStyles.lg} w-full sm:w-auto sm:self-end`}
        >
          {loading ? "處理中…" : "產生會議記錄"}
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

function ProcessingPanel({ fileName, elapsed }: { fileName: string; elapsed: number }) {
  // 依經過時間粗略標示目前大概在哪一步（僅供參考，不代表真實進度）
  const activeStep = elapsed < 3 ? 0 : 1;

  return (
    <div aria-live="polite" className="flex flex-col items-center gap-6 rounded-2xl bg-surface-2/50 px-4 py-10 text-center sm:py-12">
      <div className="flex h-12 items-center gap-1.5" aria-hidden="true">
        {Array.from({ length: 9 }).map((_, i) => (
          <span
            key={i}
            className="wave-bar h-full w-1.5 rounded-full bg-accent"
            style={{ animationDelay: `${i * 0.11}s`, opacity: 0.4 + (i % 3) * 0.2 }}
          />
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-base font-medium">正在產生會議記錄</p>
        <p className="max-w-full truncate text-sm text-muted">{fileName}</p>
      </div>
      <ol className="flex w-full max-w-xs flex-col gap-2.5 text-left text-sm">
        {STEPS.map((step, i) => (
          <li key={step} className={`flex items-center gap-2.5 ${i > activeStep ? "text-muted" : ""}`}>
            {i < activeStep ? (
              <Icon name="checkCircle" className="size-4 text-success" />
            ) : i === activeStep ? (
              <span className="grid size-4 place-items-center">
                <span className="size-2 animate-pulse rounded-full bg-accent" />
              </span>
            ) : (
              <span className="grid size-4 place-items-center">
                <span className="size-1.5 rounded-full bg-line-strong" />
              </span>
            )}
            {step}
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">
        已經過 {elapsed} 秒・長錄音可能需要幾分鐘，請不要關閉頁面
      </p>
    </div>
  );
}
