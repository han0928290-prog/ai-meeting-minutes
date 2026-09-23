import { redirect } from "next/navigation";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import { Eyebrow } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";

export const metadata = { title: "帳號設定｜AI 會議記錄" };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-3">
        <Eyebrow>帳號設定</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">你的帳號</h1>
      </header>

      <section className="flex items-center gap-4 rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent-soft text-lg font-semibold text-accent">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate font-semibold">{user.name}</p>
          <p className="truncate text-sm text-muted">{user.email}</p>
        </div>
      </section>

      <section className="flex flex-col gap-5 rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold">修改密碼</h2>
          <p className="text-sm text-muted">需要先輸入目前的密碼確認身分。</p>
        </div>
        <ChangePasswordForm />
      </section>
    </main>
  );
}
