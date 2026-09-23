"use client";

import { useActionState } from "react";
import { changePassword, type ChangePasswordState } from "@/app/actions/auth";
import { Icon, buttonStyles } from "@/components/ui";

const inputClass =
  "h-12 w-full rounded-xl border border-line-strong bg-surface px-4 text-[15px] outline-none transition-[border-color,box-shadow] focus:border-accent focus:ring-4 focus:ring-accent/15";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export default function ChangePasswordForm() {
  // 送出後 React 會自動清空表單欄位，密碼不會留在畫面上
  const [state, action, pending] = useActionState<ChangePasswordState, FormData>(changePassword, undefined);

  return (
    <form action={action} className="flex flex-col gap-5">
      <Field label="目前的密碼">
        <input name="currentPassword" type="password" required autoComplete="current-password" className={inputClass} />
      </Field>
      <Field label="新密碼" hint="至少 8 個字元">
        <input
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>
      <Field label="再輸入一次新密碼">
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>

      {state?.error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-success-soft px-3.5 py-3 text-sm text-success">
          <Icon name="checkCircle" className="mt-0.5 size-4 shrink-0" />
          密碼已更新，下次登入請使用新密碼。
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className={`${buttonStyles.dark} ${buttonStyles.md} w-full sm:w-auto sm:self-start`}
      >
        {pending ? "更新中…" : "更新密碼"}
      </button>
    </form>
  );
}
