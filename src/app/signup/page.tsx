import AuthForm from "@/components/AuthForm";
import AuthShell from "@/components/AuthShell";

export const metadata = { title: "註冊｜AI 會議記錄" };

export default function Page() {
  return (
    <AuthShell title="建立帳號" subtitle="免費註冊，上傳第一場會議錄音試試看。">
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
