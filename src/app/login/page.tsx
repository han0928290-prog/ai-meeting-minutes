import AuthForm from "@/components/AuthForm";
import AuthShell from "@/components/AuthShell";

export const metadata = { title: "登入｜AI 會議記錄" };

export default function Page() {
  return (
    <AuthShell title="歡迎回來" subtitle="登入後繼續整理你的會議記錄。">
      <AuthForm mode="login" />
    </AuthShell>
  );
}
