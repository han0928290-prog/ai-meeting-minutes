"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Icon, buttonStyles, type IconName } from "@/components/ui";
import { recordingStarts, type MeetingDetail } from "@/lib/meeting-dto";
import type { StudyNotes } from "@/lib/summarize";
import { NOTE_TYPE_LABELS } from "@/lib/upload-config";

// 講者配色：avatar 底色 + 文字色，亮暗模式都清楚
const SPEAKER_STYLES = [
  "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
];

// 逐字稿超過這個段數時先收合
const TRANSCRIPT_PREVIEW = 12;

export function formatTime(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mmss = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Card({
  title,
  icon,
  aside,
  children,
  className = "",
}: {
  title?: string;
  icon?: IconName;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex min-w-0 flex-col gap-4 rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6 print:rounded-xl print:p-4 print:shadow-none ${className}`}
    >
      {title && (
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            {icon && <Icon name={icon} className="size-[18px] text-accent" />}
            {title}
          </h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

function MetaChip({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
      <Icon name={icon} className="size-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}

// 讀書筆記：摘要、重點概念（依主題分組）、例子與補充在左欄，名詞解釋在右欄方便對照
function StudyNotesView({ notes }: { notes: StudyNotes }) {
  return (
    <>
      <Card title="摘要" icon="sparkles" className="[grid-area:summary]">
        <p className="text-[15px] leading-[1.9] text-pretty">{notes.summary}</p>
      </Card>

      <div className="min-w-0 [grid-area:actions]">
        <Card
          title="名詞解釋"
          icon="book"
          className="lg:sticky lg:top-24 print:static"
          aside={
            notes.terms.length > 0 && (
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
                {notes.terms.length}
              </span>
            )
          }
        >
          {notes.terms.length > 0 ? (
            <dl className="flex flex-col gap-2.5">
              {notes.terms.map((t, i) => (
                <div key={i} className="flex flex-col gap-1 rounded-2xl bg-surface-2/70 p-3.5 break-inside-avoid">
                  <dt className="text-sm font-semibold">{t.term}</dt>
                  <dd className="text-sm leading-relaxed text-muted">{t.definition}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted">沒有需要解釋的名詞</p>
          )}
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-5 [grid-area:points] lg:gap-6 print:gap-4">
        <Card title="重點概念" icon="list">
          {notes.sections.length > 0 ? (
            <ol className="flex flex-col gap-5">
              {notes.sections.map((s, i) => (
                <li key={i} className="flex flex-col gap-2.5">
                  <h3 className="flex items-baseline gap-3 font-semibold break-after-avoid">
                    <span className="w-6 shrink-0 font-mono text-sm text-accent tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">{s.heading}</span>
                  </h3>
                  <ul className="flex flex-col gap-2 pl-9">
                    {s.points.map((p, j) => (
                      <li key={j} className="flex gap-2.5 text-[15px] leading-relaxed break-inside-avoid">
                        <span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-accent/60" />
                        <span className="min-w-0">{p}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">沒有整理出重點概念</p>
          )}
        </Card>

        {notes.examples.length > 0 && (
          <Card title="例子與補充" icon="quote">
            <ul className="flex flex-col gap-2.5">
              {notes.examples.map((e, i) => (
                <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed break-inside-avoid">
                  <span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-accent/60" />
                  <span className="min-w-0">{e}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}

export default function MeetingView({ meeting }: { meeting: MeetingDetail }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [expanded, setExpanded] = useState(false);
  const { minutes, notes } = meeting;
  const hasResult = Boolean(minutes || notes);
  const typeLabel = NOTE_TYPE_LABELS[meeting.noteType];
  const { segments, text } = meeting.transcript;
  const speakers = [...new Set(segments.map((s) => s.speaker))];
  const hasTranscript = segments.length > 0 || text.trim().length > 0;
  const visibleSegments = expanded ? segments : segments.slice(0, TRANSCRIPT_PREVIEW);
  // 多個錄音檔接成的會議：在每個檔案開始的位置加上分隔標示
  const recordings = meeting.recordings ?? [];
  const recordingStartAt = recordingStarts(segments, recordings);
  if (recordings.length > 1 && segments.length > 0) recordingStartAt.set(0, 0);

  // 列印（按鈕或 Ctrl+P 都會觸發）時把網頁標題換成會議標題，
  // 「另存為 PDF」的預設檔名就會是會議標題；印完再還原
  useEffect(() => {
    let prevTitle: string | null = null;
    const before = () => {
      prevTitle = document.title;
      document.title = meeting.title;
    };
    const after = () => {
      if (prevTitle !== null) document.title = prevTitle;
      prevTitle = null;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [meeting.title]);

  // 點逐字稿時間戳跳到錄音對應位置
  function seekTo(ms: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = ms / 1000;
    void audio.play();
  }

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-3xl">
            {meeting.title}
          </h1>
          {(hasResult || hasTranscript) && (
            <div className="flex shrink-0 flex-wrap gap-2 print:hidden">
              {hasResult && (
                <button
                  type="button"
                  onClick={() => window.print()}
                  title={`列印${typeLabel}（不含逐字稿），或在列印視窗選「另存為 PDF」`}
                  className={`${buttonStyles.secondary} ${buttonStyles.sm} flex-1 sm:flex-none`}
                >
                  <Icon name="printer" className="size-4" />
                  列印／存成 PDF
                </button>
              )}
              {hasResult && (
                <a
                  href={`/api/meetings/${meeting.id}/docx`}
                  download
                  title={notes ? "下載 Word 檔：摘要、重點概念、名詞解釋、例子" : "下載 Word 檔：摘要、重點、待辦事項"}
                  className={`${buttonStyles.secondary} ${buttonStyles.sm} flex-1 sm:flex-none`}
                >
                  <Icon name="download" className="size-4" />
                  下載{typeLabel}
                </a>
              )}
              {hasTranscript && (
                <a
                  href={`/api/meetings/${meeting.id}/docx?content=transcript`}
                  download
                  title="下載 Word 檔：完整逐字稿"
                  className={`${buttonStyles.secondary} ${buttonStyles.sm} flex-1 sm:flex-none`}
                >
                  <Icon name="download" className="size-4" />
                  下載逐字稿
                </a>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <MetaChip icon={meeting.noteType === "study" ? "book" : "users"}>{typeLabel}</MetaChip>
          <MetaChip icon="calendar">{formatDate(meeting.meetingDate)}</MetaChip>
          {meeting.durationSeconds != null && (
            <MetaChip icon="clock">{formatTime(meeting.durationSeconds * 1000)}</MetaChip>
          )}
          {speakers.length > 0 && <MetaChip icon="users">{speakers.length} 位講者</MetaChip>}
          {recordings.length > 1 ? (
            <span title={recordings.map((r, i) => `${i + 1}. ${r.fileName}`).join("\n")}>
              <MetaChip icon="file">{recordings.length} 個錄音檔接續</MetaChip>
            </span>
          ) : (
            meeting.fileName && <MetaChip icon="file">{meeting.fileName}</MetaChip>
          )}
        </div>
      </header>

      {/* 手機：錄音 → 摘要 → 待辦 → 重點 → 逐字稿；桌機：左欄內容、右欄錄音與待辦 */}
      <div className="grid gap-5 [grid-template-areas:'audio'_'summary'_'actions'_'points'_'transcript'] lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6 lg:[grid-template-areas:'summary_audio'_'points_actions'_'transcript_actions'] print:flex print:flex-col print:gap-4">
        <div className="min-w-0 [grid-area:audio] print:hidden">
          {meeting.audioUrl ? (
            <div className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-4 shadow-card sm:p-5">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Icon name="play" className="size-4 text-accent" />
                錄音
              </p>
              <audio ref={audioRef} controls preload="metadata" src={meeting.audioUrl} className="h-10 w-full" />
              {segments.length > 0 && (
                <p className="text-xs text-muted">點逐字稿左側的時間，可直接跳到該段播放</p>
              )}
            </div>
          ) : (
            <p className="rounded-3xl border border-dashed border-line-strong p-4 text-sm text-muted">
              沒有保存錄音檔
            </p>
          )}
        </div>

        {notes ? (
          <StudyNotesView notes={notes} />
        ) : minutes ? (
          <>
            <Card title="摘要" icon="sparkles" className="[grid-area:summary]">
              <p className="text-[15px] leading-[1.9] text-pretty">{minutes.summary}</p>
            </Card>

            <div className="min-w-0 [grid-area:actions]">
              <Card
                title="待辦事項"
                icon="checkCircle"
                className="lg:sticky lg:top-24 print:static"
                aside={
                  minutes.actionItems.length > 0 && (
                    <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
                      {minutes.actionItems.length}
                    </span>
                  )
                }
              >
                {minutes.actionItems.length > 0 ? (
                  <ul className="flex flex-col gap-2.5">
                    {minutes.actionItems.map((item, i) => (
                      <li key={i} className="flex gap-3 rounded-2xl bg-surface-2/70 p-3.5 break-inside-avoid">
                        <span className="mt-[7px] size-2 shrink-0 rounded-full bg-accent" />
                        <div className="flex min-w-0 flex-col gap-2">
                          <span className="text-sm leading-relaxed">{item.task}</span>
                          <span className="flex flex-wrap gap-1.5 text-xs">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                                item.owner ? "bg-surface text-ink" : "text-muted"
                              }`}
                            >
                              <Icon name="user" className="size-3" />
                              {item.owner ?? "未指定"}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                                item.due ? "bg-warning-soft text-warning" : "text-muted"
                              }`}
                            >
                              <Icon name="calendar" className="size-3" />
                              {item.due ?? "未提及期限"}
                            </span>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">會議中沒有提到待辦事項</p>
                )}
              </Card>
            </div>

            <Card title="重點" icon="list" className="[grid-area:points]">
              {minutes.keyPoints.length > 0 ? (
                <ol className="flex flex-col gap-3">
                  {minutes.keyPoints.map((point, i) => (
                    <li key={i} className="flex gap-3 text-[15px] leading-relaxed break-inside-avoid">
                      <span className="w-6 shrink-0 pt-px font-mono text-sm font-semibold text-accent tabular-nums">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0">{point}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted">沒有整理出重點</p>
              )}
            </Card>
          </>
        ) : (
          <p className="flex items-start gap-2.5 rounded-3xl border border-warning/25 bg-warning-soft p-4 text-sm text-warning [grid-area:summary]">
            <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
            <span>{meeting.errorMessage ?? "AI 整理失敗"}，下方仍可查看完整逐字稿。</span>
          </p>
        )}

        <Card
          title="完整逐字稿"
          icon="mic"
          className="[grid-area:transcript] print:hidden"
          aside={<span className="text-xs text-muted">{segments.length} 段</span>}
        >
          {segments.length > 0 ? (
            <>
              <ol className="flex flex-col">
                {visibleSegments.map((seg, i) => {
                  const style = SPEAKER_STYLES[speakers.indexOf(seg.speaker) % SPEAKER_STYLES.length];
                  const recordingIndex = recordingStartAt.get(i);
                  const sameSpeaker =
                    i > 0 && recordingIndex === undefined && visibleSegments[i - 1].speaker === seg.speaker;
                  return (
                    <Fragment key={i}>
                      {recordingIndex !== undefined && (
                        <li className="flex items-center gap-3 pt-5 pb-1 text-xs text-muted first:pt-0">
                          <span className="h-px flex-1 bg-line-strong" />
                          <span className="flex min-w-0 items-center gap-1.5">
                            <Icon name="file" className="size-3.5 shrink-0" />
                            <span className="truncate">
                              第 {recordingIndex + 1} 個錄音檔・{recordings[recordingIndex].fileName}
                            </span>
                          </span>
                          <span className="h-px flex-1 bg-line-strong" />
                        </li>
                      )}
                      <li className={`flex gap-3 ${sameSpeaker ? "pt-1.5" : "pt-4 first:pt-0"}`}>
                        <span
                          className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold ${style} ${
                            sameSpeaker ? "invisible" : ""
                          }`}
                          aria-hidden={sameSpeaker}
                        >
                          {seg.speaker.slice(0, 2)}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          {!sameSpeaker && <span className="text-xs font-semibold">講者 {seg.speaker}</span>}
                          <p className="text-[15px] leading-relaxed break-words">
                            {meeting.audioUrl ? (
                              <button
                                type="button"
                                onClick={() => seekTo(seg.startMs)}
                                title="從這裡播放"
                                className="mr-2 rounded-md bg-surface-2 px-1.5 py-0.5 align-[1px] font-mono text-[11px] text-muted tabular-nums transition-colors hover:bg-accent-soft hover:text-accent"
                              >
                                {formatTime(seg.startMs)}
                              </button>
                            ) : (
                              <span className="mr-2 font-mono text-[11px] text-muted tabular-nums">
                                {formatTime(seg.startMs)}
                              </span>
                            )}
                            {seg.text}
                          </p>
                        </div>
                      </li>
                    </Fragment>
                  );
                })}
              </ol>
              {segments.length > TRANSCRIPT_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className={`${buttonStyles.secondary} ${buttonStyles.sm} self-center`}
                >
                  {expanded ? "收合逐字稿" : `展開全部 ${segments.length} 段`}
                  <Icon name="chevronDown" className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>
              )}
            </>
          ) : (
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{text}</p>
          )}
        </Card>
      </div>
    </article>
  );
}
