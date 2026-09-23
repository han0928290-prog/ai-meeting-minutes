"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui";
import type { PipelineStage } from "@/lib/meeting-pipeline";

const STEPS = [
  { kind: "uploading", label: "上傳錄音檔" },
  { kind: "preparing", label: "分析錄音、切成段落" },
  { kind: "transcribing", label: "語音轉文字、辨識講者" },
  { kind: "summarizing", label: "AI 整理摘要與待辦" },
] as const;

function useElapsedSeconds() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return seconds;
}

function formatElapsed(s: number) {
  return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
}

// 各步驟的細節文字與進度（都是真實數據，不做假進度）
function stageDetail(stage: PipelineStage): { text?: string; percent?: number } {
  switch (stage.kind) {
    case "uploading":
      return { text: `${Math.round(stage.percent)}%`, percent: stage.percent };
    case "transcribing":
      return stage.total > 1
        ? { text: `${stage.done} / ${stage.total} 段`, percent: (stage.done / stage.total) * 100 }
        : {};
    default:
      return {};
  }
}

export default function ProcessingStatus({ stage, title }: { stage: PipelineStage; title: string }) {
  const elapsed = useElapsedSeconds();
  const activeIndex = STEPS.findIndex((s) => s.kind === stage.kind);
  const detail = stageDetail(stage);

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

      <div className="flex max-w-full flex-col gap-1">
        <p className="text-base font-medium">正在產生會議記錄</p>
        <p className="truncate text-sm text-muted">{title}</p>
      </div>

      <ol className="flex w-full max-w-xs flex-col gap-3 text-left text-sm">
        {STEPS.map((step, i) => {
          const isActive = i === activeIndex;
          return (
            <li key={step.kind} className={`flex flex-col gap-1.5 ${i > activeIndex ? "text-muted" : ""}`}>
              <span className="flex items-center gap-2.5">
                {i < activeIndex ? (
                  <Icon name="checkCircle" className="size-4 shrink-0 text-success" />
                ) : isActive ? (
                  <span className="grid size-4 shrink-0 place-items-center">
                    <span className="size-2 animate-pulse rounded-full bg-accent" />
                  </span>
                ) : (
                  <span className="grid size-4 shrink-0 place-items-center">
                    <span className="size-1.5 rounded-full bg-line-strong" />
                  </span>
                )}
                <span className="flex-1">{step.label}</span>
                {isActive && detail.text && <span className="text-xs text-muted tabular-nums">{detail.text}</span>}
              </span>
              {isActive && detail.percent !== undefined && (
                <span className="ml-6.5 h-1 overflow-hidden rounded-full bg-line">
                  <span
                    className="block h-full rounded-full bg-accent transition-[width] duration-500"
                    style={{ width: `${Math.max(3, detail.percent)}%` }}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <p className="text-xs text-muted">
        已經過 {formatElapsed(elapsed)}・長錄音可能需要好幾分鐘，處理完成前請不要關閉頁面
      </p>
    </div>
  );
}
