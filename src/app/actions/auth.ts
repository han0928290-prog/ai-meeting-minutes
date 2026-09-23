"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/dal";
import { connectDB } from "@/lib/mongodb";
import { createSession, deleteSession } from "@/lib/session";
import { UserModel } from "@/models/User";

export type AuthFormState = {
  error?: string;
  email?: string;
  name?: string;
} | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

// 註冊白名單：.env.local 的 ALLOWED_SIGNUP_EMAILS（逗號分隔）。未設定時一律不開放註冊
function isSignupAllowed(email: string) {
  const allowed = (process.env.ALLOWED_SIGNUP_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email);
}

// 註冊與修改密碼共用的密碼規則；合格回傳 null
function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `密碼至少 ${MIN_PASSWORD} 個字元`;
  // bcrypt 只取前 72 bytes，超過的部分會被忽略
  if (new TextEncoder().encode(password).length > 72) return "密碼太長";
  return null;
}

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function signup(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const name = field(formData, "name");
  const email = field(formData, "email").toLowerCase();
  const password = formData.get("password");
  const keep = { name, email };

  if (!name) return { ...keep, error: "請輸入名稱" };
  if (name.length > 50) return { ...keep, error: "名稱最多 50 個字" };
  if (!EMAIL_RE.test(email)) return { ...keep, error: "Email 格式不正確" };
  if (!isSignupAllowed(email)) return { ...keep, error: "目前僅開放受邀的帳號註冊" };
  if (typeof password !== "string") return { ...keep, error: `密碼至少 ${MIN_PASSWORD} 個字元` };
  const passwordError = validatePassword(password);
  if (passwordError) return { ...keep, error: passwordError };

  await connectDB();
  const passwordHash = await bcrypt.hash(password, 10);

  let userId: string;
  try {
    const user = await UserModel.create({ name, email, passwordHash });
    userId = String(user._id);
  } catch (err) {
    // email 唯一索引衝突
    if ((err as { code?: number }).code === 11000) {
      return { ...keep, error: "這個 Email 已經註冊過了" };
    }
    throw err;
  }

  await createSession(userId);
  redirect("/new");
}

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email").toLowerCase();
  const password = formData.get("password");

  if (!email || typeof password !== "string" || !password) {
    return { email, error: "請輸入 Email 和密碼" };
  }

  await connectDB();
  const user = await UserModel.findOne({ email }).select("+passwordHash");
  // 帳號不存在與密碼錯誤回同樣訊息，避免被拿來探測哪些 email 有註冊
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !ok) {
    return { email, error: "Email 或密碼錯誤" };
  }

  await createSession(String(user._id));
  redirect("/new");
}

export type ChangePasswordState = { error?: string; success?: boolean } | undefined;

export async function changePassword(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  // Server Action 是可被直接呼叫的公開端點，必須自己確認登入狀態
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const current = formData.get("currentPassword");
  const next = formData.get("newPassword");
  const confirm = formData.get("confirmPassword");
  if (typeof current !== "string" || typeof next !== "string" || typeof confirm !== "string") {
    return { error: "請填寫所有欄位" };
  }
  if (!current) return { error: "請輸入目前的密碼" };
  const passwordError = validatePassword(next);
  if (passwordError) return { error: `新${passwordError}` };
  if (next !== confirm) return { error: "兩次輸入的新密碼不一致" };
  if (next === current) return { error: "新密碼不能和目前的密碼相同" };

  await connectDB();
  const user = await UserModel.findById(userId).select("+passwordHash");
  if (!user) {
    // 帳號已不存在：清掉殘留的 session
    await deleteSession();
    redirect("/login");
  }
  if (!(await bcrypt.compare(current, user.passwordHash))) {
    return { error: "目前的密碼不正確" };
  }

  user.passwordHash = await bcrypt.hash(next, 10);
  await user.save();
  return { success: true };
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
