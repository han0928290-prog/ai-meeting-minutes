import MeetingDetailLoader from "@/components/MeetingDetailLoader";
import { verifySession } from "@/lib/dal";

export const metadata = { title: "會議紀錄｜AI 會議記錄" };

export default async function MeetingPage(props: PageProps<"/meetings/[id]">) {
  await verifySession();
  const { id } = await props.params;
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <MeetingDetailLoader id={id} />
    </main>
  );
}
