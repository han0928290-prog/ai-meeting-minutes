import AuthForm from "@/components/AuthForm";
import AuthShell from "@/components/AuthShell";
import { pageTitle } from "@/lib/site";

export const metadata = { title: pageTitle("登入") };

export default function Page() {
  return (
    <AuthShell title="歡迎回來" subtitle="登入後繼續整理你的會議記錄。">
      <AuthForm mode="login" />
    </AuthShell>
  );
}
