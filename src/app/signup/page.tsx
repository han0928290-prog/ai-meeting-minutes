import AuthForm from "@/components/AuthForm";
import AuthShell from "@/components/AuthShell";
import { pageTitle } from "@/lib/site";

export const metadata = { title: pageTitle("註冊") };

export default function Page() {
  return (
    <AuthShell title="建立帳號" subtitle="免費註冊，上傳第一場會議錄音試試看。">
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
