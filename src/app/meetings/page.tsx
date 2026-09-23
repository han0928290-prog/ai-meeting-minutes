import Link from "next/link";
import MeetingHistory from "@/components/MeetingHistory";
import { Eyebrow, Icon, buttonStyles } from "@/components/ui";
import { verifySession } from "@/lib/dal";

export const metadata = { title: "歷史紀錄｜AI 會議記錄" };

export default async function MeetingsPage() {
  await verifySession();
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3">
          <Eyebrow>歷史紀錄</Eyebrow>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">你的會議</h1>
        </div>
        <Link href="/new" className={`${buttonStyles.dark} ${buttonStyles.md} w-full sm:w-auto`}>
          <Icon name="plus" className="size-4" />
          新增會議
        </Link>
      </header>
      <MeetingHistory />
    </main>
  );
}
