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
  uploadFiles,
  type PipelineStage,
} from "@/lib/meeting-pipeline";
import {
  ATTACHMENT_EXTENSIONS,
  ATTACHMENT_KIND_BY_EXT,
  AUDIO_EXTENSIONS,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENTS_TOTAL_BYTES,
  MAX_ATTACHMENT_BYTES,
  MAX_AUDIO_SECONDS,
  MAX_RECORDINGS,
  MAX_UPLOAD_BYTES,
  fileExtension,
} from "@/lib/upload-config";

const ACCEPT = `${AUDIO_EXTENSIONS.map((e) => `.${e}`).join(",")},audio/*`;
const ATTACHMENT_ACCEPT = ATTACHMENT_EXTENSIONS.map((e) => `.${e}`).join(",");
const MAX_FILE_MB = MAX_UPLOAD_BYTES / 1024 / 1024;
const MAX_ATTACHMENT_MB = MAX_ATTACHMENT_BYTES / 1024 / 1024;
const MAX_ATTACHMENTS_TOTAL_MB = MAX_ATTACHMENTS_TOTAL_BYTES / 1024 / 1024;
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
  // 依加入順序排列，伺服器會照這個順序把錄音接成同一場會議
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [draggingAttachments, setDraggingAttachments] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [stage, setStage] = useState<PipelineStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MeetingDetail | null>(null);
  // 會議紀錄已建立後才失敗：重試時從這筆紀錄續跑，不用重新上傳
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const loading = stage !== null;
  useLeaveWarning(loading);

  // 錄音可以多選、分次加入，接在現有清單後面；不合格的檔案略過並提示，其餘照樣加入
  function addFiles(selected: File[]) {
    setResult(null);
    setError(null);
    // 錄音變了就是一場新的會議，不沿用先前失敗的紀錄
    setMeetingId(null);
    const problems: string[] = [];
    const next = [...files];
    for (const f of selected) {
      if (!AUDIO_EXTENSIONS.includes(fileExtension(f.name))) {
        problems.push(`「${f.name}」格式不支援，請上傳 ${AUDIO_EXTENSIONS.join("、").toUpperCase()} 檔`);
      } else if (next.length >= MAX_RECORDINGS) {
        problems.push(`錄音檔最多 ${MAX_RECORDINGS} 個`);
        break;
      } else if (next.reduce((sum, a) => sum + a.size, 0) + f.size > MAX_UPLOAD_BYTES) {
        problems.push(`錄音檔合計不能超過 ${MAX_FILE_MB}MB`);
        break;
      } else if (!next.some((a) => a.name === f.name && a.size === f.size)) {
        next.push(f);
      }
    }
    setFiles(next);
    if (problems.length > 0) setError(problems.join("；"));
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile(index: number) {
    setError(null);
    setMeetingId(null);
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // 調整錄音順序：offset -1 往前、+1 往後
  function moveFile(index: number, offset: -1 | 1) {
    setMeetingId(null);
    setFiles((prev) => {
      const next = [...prev];
      const target = index + offset;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function clearFiles() {
    setFiles([]);
    setError(null);
    setMeetingId(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  // 補充資料可以多選、分次加入；不合格的檔案略過並提示，其餘照樣加入
  function addAttachments(selected: File[]) {
    setAttachmentError(null);
    // 補充資料變了就是一場新的會議，不沿用先前失敗的紀錄
    setMeetingId(null);
    const problems: string[] = [];
    const next = [...attachments];
    for (const f of selected) {
      if (!ATTACHMENT_EXTENSIONS.includes(fileExtension(f.name))) {
        problems.push(`「${f.name}」格式不支援`);
      } else if (f.size > MAX_ATTACHMENT_BYTES) {
        problems.push(`「${f.name}」超過 ${MAX_ATTACHMENT_MB}MB`);
      } else if (next.length >= MAX_ATTACHMENTS) {
        problems.push(`最多 ${MAX_ATTACHMENTS} 個檔案`);
        break;
      } else if (next.reduce((sum, a) => sum + a.size, 0) + f.size > MAX_ATTACHMENTS_TOTAL_BYTES) {
        problems.push(`合計不能超過 ${MAX_ATTACHMENTS_TOTAL_MB}MB`);
        break;
      } else if (!next.some((a) => a.name === f.name && a.size === f.size)) {
        next.push(f);
      }
    }
    setAttachments(next);
    if (problems.length > 0) setAttachmentError(problems.join("；"));
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
  }

  function removeAttachment(index: number) {
    setAttachmentError(null);
    setMeetingId(null);
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function handleAttachmentDrop(e: React.DragEvent) {
    e.preventDefault();
    setDraggingAttachments(false);
    if (loading) return;
    addAttachments(Array.from(e.dataTransfer.files ?? []));
  }

  function startOver() {
    setResult(null);
    setAttachments([]);
    setAttachmentError(null);
    clearFiles();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (loading) return;
    addFiles(Array.from(e.dataTransfer.files ?? []));
  }

  async function run() {
    if (files.length === 0) return;
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
        const uploaded = await uploadFiles(files, attachments, userId, (percent) =>
          setStage({ kind: "uploading", percent }),
        );
        setStage({ kind: "preparing" });
        const created = await createMeeting(uploaded);
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
        <div className="flex flex-col gap-4 rounded-2xl border border-success/25 bg-success-soft p-4 print:hidden sm:flex-row sm:items-center sm:justify-between sm:p-5">
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
          <ProcessingStatus
            stage={stage}
            title={files.length > 1 ? `${files[0].name} 等 ${files.length} 個錄音檔` : (files[0]?.name ?? "")}
          />
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
              multiple
              accept={ACCEPT}
              onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
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
                MP3、M4A、WAV、WEBM 等格式，合計最長 {MAX_HOURS} 小時、{MAX_FILE_MB}MB 以內
              </span>
              <span className="text-sm text-muted">
                同一場會議錄成好幾個檔？可以一次選多個，會依清單順序接續分析
              </span>
            </span>
          </label>
        )}

        {files.length > 0 && !loading && (
          <ol className="flex flex-col gap-2">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${f.size}`}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2/60 p-3"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  {files.length > 1 ? (
                    <span className="font-mono text-sm font-semibold tabular-nums">{i + 1}</span>
                  ) : (
                    <Icon name="file" className="size-5" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{f.name}</span>
                  <span className="text-xs text-muted">{formatSize(f.size)}</span>
                </span>
                {files.length > 1 && (
                  <span className="flex shrink-0">
                    <button
                      type="button"
                      onClick={() => moveFile(i, -1)}
                      disabled={i === 0}
                      aria-label={`把 ${f.name} 往前移`}
                      className={`${buttonStyles.ghost} size-9 disabled:opacity-30`}
                    >
                      <Icon name="chevronDown" className="size-4 rotate-180" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveFile(i, 1)}
                      disabled={i === files.length - 1}
                      aria-label={`把 ${f.name} 往後移`}
                      className={`${buttonStyles.ghost} size-9 disabled:opacity-30`}
                    >
                      <Icon name="chevronDown" className="size-4" />
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  aria-label={`移除 ${f.name}`}
                  className={`${buttonStyles.ghost} size-9 shrink-0`}
                >
                  <Icon name="x" className="size-4" />
                </button>
              </li>
            ))}
          </ol>
        )}

        {!loading && (
          <section className="flex flex-col gap-3 border-t border-line pt-5">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-sm font-semibold">
                補充資料 <span className="font-normal text-muted">（選填）</span>
              </h2>
              <p className="text-sm text-muted">附上簡報、白板照片或會議文件，AI 會和錄音一起參考，專有名詞與數字更準確。</p>
            </div>

            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDraggingAttachments(true);
              }}
              onDragLeave={() => setDraggingAttachments(false)}
              onDrop={handleAttachmentDrop}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-4 transition-colors ${
                draggingAttachments
                  ? "border-accent bg-accent-soft"
                  : "border-line-strong bg-surface-2/50 hover:border-accent/60 hover:bg-accent-soft/60"
              }`}
            >
              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                accept={ATTACHMENT_ACCEPT}
                onChange={(e) => addAttachments(Array.from(e.target.files ?? []))}
                className="sr-only"
              />
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-accent shadow-card">
                <Icon name="paperclip" className="size-5" />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">
                  <span className="hidden sm:inline">拖曳檔案到這裡，或</span>
                  <span className="text-accent underline decoration-accent/30 underline-offset-4">加入檔案</span>
                </span>
                <span className="text-xs text-muted">
                  圖片（PNG、JPG、WEBP）、PDF、TXT、MD、CSV，最多 {MAX_ATTACHMENTS} 個、單檔 {MAX_ATTACHMENT_MB}MB
                </span>
              </span>
            </label>

            {attachments.length > 0 && (
              <ul className="flex flex-col gap-2">
                {attachments.map((a, i) => (
                  <li
                    key={`${a.name}-${a.size}`}
                    className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/60 px-3 py-2"
                  >
                    <Icon
                      name={ATTACHMENT_KIND_BY_EXT[fileExtension(a.name)]?.kind === "image" ? "image" : "document"}
                      className="size-4 shrink-0 text-accent"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                    <span className="shrink-0 text-xs text-muted">{formatSize(a.size)}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      aria-label={`移除 ${a.name}`}
                      className={`${buttonStyles.ghost} size-8 shrink-0`}
                    >
                      <Icon name="x" className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {attachmentError && (
              <p role="alert" className="flex items-start gap-2 text-sm text-danger">
                <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
                {attachmentError}
              </p>
            )}
          </section>
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
          disabled={files.length === 0 || loading}
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
