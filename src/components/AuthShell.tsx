import { Icon, type IconName } from "@/components/ui";

const POINTS: { icon: IconName; text: string }[] = [
  { icon: "users", text: "分講者、附時間軸的逐字稿" },
  { icon: "sparkles", text: "摘要與重點，三十秒看完一場會" },
  { icon: "checkCircle", text: "待辦事項自動列出負責人與期限" },
  { icon: "shield", text: "每筆紀錄只有你自己看得到" },
];

export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-16">
      <section className="relative hidden overflow-hidden rounded-[2rem] bg-ink p-10 text-canvas lg:flex lg:min-h-[560px] lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-accent opacity-40 blur-3xl"
        />
        <div className="relative flex flex-col gap-5">
          <p className="text-3xl leading-snug font-semibold tracking-tight">
            專心開會，
            <br />
            記錄交給 AI。
          </p>
          <p className="max-w-sm text-[15px] leading-relaxed opacity-70">
            上傳錄音，幾分鐘內拿到一份整理好的會議記錄。
          </p>
        </div>
        <ul className="relative flex flex-col gap-4">
          {POINTS.map((p) => (
            <li key={p.text} className="flex items-center gap-3 text-sm">
              <span className="grid size-9 place-items-center rounded-xl bg-canvas/10">
                <Icon name={p.icon} className="size-4" />
              </span>
              <span className="opacity-90">{p.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto flex w-full max-w-md flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="text-[15px] text-muted">{subtitle}</p>
        </header>
        {children}
      </section>
    </main>
  );
}
