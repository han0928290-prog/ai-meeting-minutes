import Link from "next/link";
import { logout } from "@/app/actions/auth";
import HeaderNav from "@/components/HeaderNav";
import { Icon, Logo, buttonStyles } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";

export default async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/80 backdrop-blur-xl supports-[backdrop-filter]:bg-canvas/70">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="AI 會議記錄 首頁" className="shrink-0">
          <span className="sm:hidden">
            <Logo compact={Boolean(user)} />
          </span>
          <span className="hidden sm:inline">
            <Logo />
          </span>
        </Link>

        {user ? (
          <div className="flex min-w-0 items-center gap-1 sm:gap-3">
            <HeaderNav />
            <span className="mx-1 hidden h-5 w-px bg-line-strong sm:block" />
            <Link
              href="/account"
              title={`帳號設定（${user.email}）`}
              aria-label="帳號設定"
              className="inline-flex max-w-[10rem] items-center gap-2 rounded-full p-1 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink md:pr-3"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                {user.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden truncate md:inline">{user.name}</span>
            </Link>
            <form action={logout}>
              <button type="submit" title="登出" aria-label="登出" className={`${buttonStyles.ghost} size-9`}>
                <Icon name="logout" className="size-[18px]" />
              </button>
            </form>
          </div>
        ) : (
          <Link href="/login" className={`${buttonStyles.dark} ${buttonStyles.sm}`}>
            登入
          </Link>
        )}
      </div>
    </header>
  );
}
