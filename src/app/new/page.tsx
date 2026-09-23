import AudioUploader from "@/components/AudioUploader";
import { Eyebrow } from "@/components/ui";
import { verifySession } from "@/lib/dal";

export const metadata = { title: "新增會議｜AI 會議記錄" };

export default async function NewMeetingPage() {
  const { userId } = await verifySession();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex max-w-2xl flex-col gap-3">
        <Eyebrow>新增會議</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">上傳錄音，其餘交給 AI</h1>
        <p className="text-[15px] leading-relaxed text-muted">
          自動產生分好講者的逐字稿，並整理出摘要、重點與待辦事項，完成後會保存到你的歷史紀錄。
        </p>
      </header>
      <AudioUploader userId={userId} />
    </main>
  );
}
