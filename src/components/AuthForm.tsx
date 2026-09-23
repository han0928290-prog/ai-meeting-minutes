"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, signup, type AuthFormState } from "@/app/actions/auth";
import { Icon, buttonStyles } from "@/components/ui";

const inputClass =
  "h-12 w-full rounded-xl border border-line-strong bg-surface px-4 text-[15px] outline-none transition-[border-color,box-shadow] placeholder:text-muted/60 focus:border-accent focus:ring-4 focus:ring-accent/15";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    isSignup ? signup : login,
    undefined,
  );

  return (
    <form action={action} className="flex flex-col gap-5">
      {isSignup && (
        <Field label="名稱">
          <input
            name="name"
            required
            maxLength={50}
            autoComplete="name"
            placeholder="怎麼稱呼你"
            defaultValue={state?.name}
            className={inputClass}
          />
        </Field>
      )}

      <Field label="Email">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          defaultValue={state?.email}
          className={inputClass}
        />
      </Field>

      <Field label="密碼" hint={isSignup ? "至少 8 個字元" : undefined}>
        <input
          name="password"
          type="password"
          required
          minLength={isSignup ? 8 : undefined}
          autoComplete={isSignup ? "new-password" : "current-password"}
          className={inputClass}
        />
      </Field>

      {state?.error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className={`${buttonStyles.dark} ${buttonStyles.lg} mt-1 w-full`}>
        {pending ? "處理中…" : isSignup ? "建立帳號" : "登入"}
        {!pending && <Icon name="arrowRight" className="size-4" />}
      </button>

      {isSignup ? (
        <p className="text-center text-sm text-muted">
          已經有帳號了？
          <Link href="/login" className="ml-1 font-medium text-accent underline-offset-4 hover:underline">
            登入
          </Link>
        </p>
      ) : (
        <p className="text-center text-sm text-muted">目前僅開放受邀使用</p>
      )}
    </form>
  );
}
