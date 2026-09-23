import Link from "next/link";
import { Eyebrow, Icon, Logo, buttonStyles, type IconName } from "@/components/ui";
import { getSessionUserId } from "@/lib/dal";

export const metadata = {
  title: "AI 會議記錄｜上傳錄音，自動產生逐字稿、摘要與待辦",
  description: "上傳會議錄音，幾分鐘內拿到分講者的逐字稿、摘要、重點與待辦事項。",
};

const FEATURES: { icon: IconName; title: string; desc: string }[] = [
  {
    icon: "users",
    title: "分講者的逐字稿",
    desc: "自動辨識不同講者並標上時間軸，繁體中文輸出。點時間就能從那一段開始回放錄音。",
  },
  {
    icon: "sparkles",
    title: "摘要與重點",
    desc: "把一小時的討論濃縮成幾句摘要與條列重點，會後不用再翻逐字稿找結論。",
  },
  {
    icon: "checkCircle",
    title: "待辦事項",
    desc: "列出會議中提到的待辦，標出負責人與期限。沒講清楚的就標「未指定」，不會亂猜。",
  },
  {
    icon: "history",
    title: "歷史紀錄與回放",
    desc: "每場會議連同錄音檔保存在你的帳號裡，隨時回來查看、重聽。",
  },
];

const AUDIENCES: { icon: IconName; title: string; desc: string }[] = [
  { icon: "list", title: "專案經理、團隊主管", desc: "週會、站會開完，待辦與負責人已經列好，直接貼給團隊追進度。" },
  { icon: "quote", title: "業務與顧問", desc: "客戶訪談專心聽，需求與承諾事項交給 AI 整理，不漏掉任何細節。" },
  { icon: "mic", title: "研究者與學生", desc: "訪談、焦點團體、課堂討論，逐字稿附講者與時間，引用、回聽都方便。" },
  { icon: "sparkles", title: "創業與小型團隊", desc: "沒有專人做會議記錄也沒關係，每個決策都有紀錄可以回頭查。" },
];

const STEPS: { title: string; desc: string }[] = [
  { title: "登入帳號", desc: "目前採邀請制，用受邀的 Email 登入即可開始。" },
  { title: "上傳錄音", desc: "支援 MP3、M4A、WAV、WEBM 等格式，單檔 25MB 以內。" },
  { title: "拿到會議記錄", desc: "幾分鐘後拿到逐字稿、摘要、重點與待辦，並自動保存。" },
];

// 波形高度固定寫死，避免每次 render 不同造成 hydration 差異
const WAVE = [0.3, 0.55, 0.8, 0.45, 0.95, 0.6, 0.35, 0.7, 1, 0.5, 0.75, 0.4, 0.85, 0.55, 0.3, 0.65, 0.9, 0.45, 0.6, 0.35, 0.8, 0.5, 0.7, 0.4];

function ProductPreview() {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-8 rounded-[3rem] bg-accent opacity-[0.12] blur-3xl"
      />
      <div className="relative overflow-hidden rounded-[1.75rem] border border-line bg-surface shadow-[0_30px_80px_-30px_rgb(22_22_26/0.35)]">
        <div className="flex items-center gap-1.5 border-b border-line px-5 py-3.5">
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="ml-3 truncate text-xs text-muted">範例會議記錄</span>
        </div>

        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-col gap-2">
            <p className="text-lg font-semibold tracking-tight">產品週會：新版上線與行銷預算</p>
            <p className="flex flex-wrap gap-x-3 text-xs text-muted">
              <span>39 分鐘</span>
              <span>3 位講者</span>
              <span>2 項待辦</span>
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3.5 py-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
              <Icon name="play" className="size-3.5" />
            </span>
            <span className="flex h-7 flex-1 items-center gap-[3px] overflow-hidden" aria-hidden="true">
              {WAVE.map((h, i) => (
                <span
                  key={i}
                  className={`w-[3px] shrink-0 rounded-full ${i < 9 ? "bg-accent" : "bg-line-strong"}`}
                  style={{ height: `${h * 100}%` }}
                />
              ))}
            </span>
            <span className="font-mono text-[11px] text-muted tabular-nums">12:08</span>
          </div>

          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-accent">
              <Icon name="sparkles" className="size-3.5" />
              摘要
            </p>
            <p className="text-sm leading-relaxed">
              確認新版 App 於 <span className="marker">10 月 15 日上線</span>；登入頁的兩個錯誤需在本週修正，
              本季行銷預算提高到 50 萬。
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-accent">
              <Icon name="checkCircle" className="size-3.5" />
              待辦事項
            </p>
            {[
              { task: "修好登入頁的兩個錯誤", owner: "小華", due: "這週五前" },
              { task: "規劃社群廣告並交提案", owner: "小美", due: "下週一" },
            ].map((a) => (
              <div key={a.task} className="flex items-start gap-2.5 rounded-xl bg-surface-2/70 p-3">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
                  <span>{a.task}</span>
                  <span className="flex gap-1.5 text-[11px]">
                    <span className="rounded-full bg-surface px-2 py-0.5">{a.owner}</span>
                    <span className="rounded-full bg-warning-soft px-2 py-0.5 text-warning">{a.due}</span>
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function LandingPage() {
  const loggedIn = Boolean(await getSessionUserId());
  const primaryHref = loggedIn ? "/new" : "/login";
  const primaryLabel = loggedIn ? "前往工作台" : "登入開始使用";

  return (
    <main className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--line-strong)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
        />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-4 pt-14 pb-20 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pt-24 lg:pb-28">
          <div className="flex flex-col items-start gap-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted shadow-card">
              <span className="flex h-3 items-center gap-[2px]" aria-hidden="true">
                {[0.5, 1, 0.65, 0.85].map((h, i) => (
                  <span
                    key={i}
                    className="wave-bar w-[2px] rounded-full bg-accent"
                    style={{ height: `${h * 100}%`, animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
              上傳錄音 → 完整會議記錄
            </span>

            <h1 className="text-[2.6rem] leading-[1.12] font-semibold tracking-tight sm:text-6xl sm:leading-[1.08]">
              專心開會，
              <br />
              <span className="marker">會議記錄</span>交給 AI
            </h1>

            <p className="max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              上傳一段會議錄音，幾分鐘內拿到分好講者的逐字稿、摘要、重點與待辦事項。每一場都保存在你的帳號裡，隨時回顧、回放。
            </p>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link href={primaryHref} className={`${buttonStyles.primary} ${buttonStyles.lg} w-full sm:w-auto`}>
                {primaryLabel}
                <Icon name="arrowRight" className="size-4" />
              </Link>
              {loggedIn ? (
                <Link href="/meetings" className={`${buttonStyles.secondary} ${buttonStyles.lg} w-full sm:w-auto`}>
                  查看歷史紀錄
                </Link>
              ) : (
                <a href="#features" className={`${buttonStyles.secondary} ${buttonStyles.lg} w-full sm:w-auto`}>
                  了解功能
                </a>
              )}
            </div>

            <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="check" className="size-3.5 text-success" />
                繁體中文逐字稿
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="check" className="size-3.5 text-success" />
                自動辨識講者
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="check" className="size-3.5 text-success" />
                只有你看得到
              </span>
            </p>
          </div>

          <ProductPreview />
        </div>
      </section>

      {/* 在做什麼 */}
      <section id="features" className="border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-20 sm:px-6 lg:py-28">
          <div className="flex max-w-2xl flex-col gap-4">
            <Eyebrow>在做什麼</Eyebrow>
            <h2 className="text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
              一段錄音進去，一份能直接用的會議記錄出來
            </h2>
            <p className="text-base leading-relaxed text-muted">
              不只是語音轉文字。AI 會讀完整場會議，替你整理出真正需要的東西。
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="group flex flex-col gap-4 rounded-3xl border border-line bg-canvas p-6 transition-colors hover:border-accent/30 sm:p-7"
              >
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-2xl bg-surface text-accent shadow-card">
                    <Icon name={f.icon} className="size-5" />
                  </span>
                  <span className="font-mono text-xs text-muted tabular-nums">0{i + 1}</span>
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                  <p className="text-[15px] leading-relaxed text-muted">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 給誰用 */}
      <section id="audience" className="border-t border-line">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:py-28">
          <div className="flex flex-col gap-4 lg:sticky lg:top-28 lg:self-start">
            <Eyebrow>給誰用</Eyebrow>
            <h2 className="text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
              需要開會、又不想邊開邊打字的人
            </h2>
            <p className="text-base leading-relaxed text-muted">
              會議中專心討論，會後把錄音丟進來就好。
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {AUDIENCES.map((a) => (
              <li key={a.title} className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-6 shadow-card">
                <Icon name={a.icon} className="size-5 text-accent" />
                <h3 className="font-semibold">{a.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{a.desc}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 怎麼開始 */}
      <section id="how" className="border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-20 sm:px-6 lg:py-28">
          <div className="flex max-w-2xl flex-col gap-4">
            <Eyebrow>怎麼開始</Eyebrow>
            <h2 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">三個步驟，馬上開始</h2>
          </div>
          <ol className="grid gap-8 md:grid-cols-3 md:gap-6">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative flex gap-5 md:flex-col md:gap-5">
                {i < STEPS.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute top-14 bottom-[-2rem] left-6 w-px bg-line-strong md:top-6 md:right-[-1.5rem] md:bottom-auto md:left-14 md:h-px md:w-auto"
                  />
                )}
                <span className="relative grid size-12 shrink-0 place-items-center rounded-2xl bg-ink font-mono text-lg font-semibold text-canvas">
                  {i + 1}
                </span>
                <div className="flex flex-col gap-1.5 pt-1 md:pt-0">
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="text-[15px] leading-relaxed text-muted">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 登入入口 */}
      <section className="px-4 py-20 sm:px-6 lg:py-24">
        <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-7 overflow-hidden rounded-[2rem] bg-ink px-6 py-16 text-center text-canvas sm:py-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 left-1/2 size-96 -translate-x-1/2 rounded-full bg-accent opacity-40 blur-3xl"
          />
          <h2 className="relative max-w-2xl text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
            下一場會議，讓 AI 幫你記
          </h2>
          <p className="relative max-w-md text-base leading-relaxed opacity-70">
            登入後上傳第一段錄音，看看你的會議記錄長什麼樣子。
          </p>
          <Link
            href={primaryHref}
            className="relative inline-flex h-12 items-center gap-2 rounded-full bg-canvas px-7 text-[15px] font-medium text-ink transition-opacity hover:opacity-90"
          >
            {loggedIn ? "上傳錄音" : "登入開始使用"}
            <Icon name="arrowRight" className="size-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:px-6">
          <Logo />
          <p>© {new Date().getFullYear()} AI 會議記錄</p>
        </div>
      </footer>
    </main>
  );
}
