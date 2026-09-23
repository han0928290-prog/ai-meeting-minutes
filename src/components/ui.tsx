import type { SVGProps } from "react";

// 全站共用的小型 UI 元件：圖示、Logo、按鈕樣式

const ICON_PATHS = {
  upload: "M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  sparkles:
    "M12 3v3m0 12v3M3 12h3m12 0h3M6.3 6.3l2.1 2.1m7.2 7.2 2.1 2.1m0-11.4-2.1 2.1m-7.2 7.2-2.1 2.1",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  check: "m5 12.5 4.5 4.5L19 7.5",
  checkCircle: "M9 12.5 11 14.5 15.5 10M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  users:
    "M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1m18 0v-1a4 4 0 0 0-3-3.87M15 4.13a4 4 0 0 1 0 7.75M13.5 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  arrowRight: "M5 12h14m-6-6 6 6-6 6",
  arrowLeft: "M19 12H5m6 6-6-6 6-6",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M10 17v-5l4 2.5-4 2.5Z",
  shield: "M12 3 4.5 6v5.5c0 4.5 3.2 8.3 7.5 9.5 4.3-1.2 7.5-5 7.5-9.5V6L12 3Zm-3 9 2 2 4-4",
  play: "M7 5.5v13l11-6.5-11-6.5Z",
  calendar: "M7 3v3m10-3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  logout: "M15 17l5-5-5-5m5 5H9m4 9H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7",
  plus: "M12 5v14M5 12h14",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2",
  x: "M6 6l12 12M18 6 6 18",
  alert: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  quote: "M4 21c3 0 7-1 7-8V5H4v7h4c0 4-2 6-4 6v3Zm11 0c3 0 7-1 7-8V5h-7v7h4c0 4-2 6-4 6v3Z",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 19v3",
  chevronDown: "m6 9 6 6 6-6",
  user: "M20 21v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function Icon({
  name,
  className = "size-5",
  ...props
}: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

// Logo：麥克風聲波 + 文字，代表「錄音 → 記錄」
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-[10px] bg-ink text-canvas">
        <span className="flex h-3.5 items-center gap-[2px]">
          {[0.5, 1, 0.7, 0.9, 0.45].map((h, i) => (
            <span key={i} className="w-[2.5px] rounded-full bg-current" style={{ height: `${h * 100}%` }} />
          ))}
        </span>
      </span>
      {!compact && <span className="text-[15px] font-semibold tracking-tight">AI 會議記錄</span>}
    </span>
  );
}

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-[background-color,color,box-shadow,opacity] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";

export const buttonStyles = {
  primary: `${BUTTON_BASE} bg-accent text-accent-ink hover:bg-accent-hover shadow-[0_6px_20px_-8px_var(--accent)]`,
  dark: `${BUTTON_BASE} bg-ink text-canvas hover:opacity-90`,
  secondary: `${BUTTON_BASE} border border-line-strong bg-surface text-ink hover:bg-surface-2`,
  ghost: `${BUTTON_BASE} text-muted hover:bg-surface-2 hover:text-ink`,
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-[15px]",
  sm: "h-9 px-4 text-sm",
};

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-accent uppercase">
      <span className="h-px w-5 bg-current" />
      {children}
    </span>
  );
}
