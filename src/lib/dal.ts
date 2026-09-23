import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/mongodb";
import { SESSION_COOKIE, decrypt } from "@/lib/session-token";
import { UserModel } from "@/models/User";

// 資料存取層：所有需要登入的資料讀寫都要經過這裡確認身分，
// proxy 的檢查只是提早導向，不能當成唯一防線

/** 讀取目前登入者 id；未登入回傳 null（給 API route 回 401 用） */
export const getSessionUserId = cache(async (): Promise<string | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await decrypt(token);
  return session?.userId ?? null;
});

/** 頁面用：未登入直接導向登入頁 */
export const verifySession = cache(async () => {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  return { userId };
});

/** 目前登入者的公開資料；帳號已不存在時回傳 null */
export const getCurrentUser = cache(async () => {
  const userId = await getSessionUserId();
  if (!userId) return null;
  await connectDB();
  const user = await UserModel.findById(userId).select("email name").lean();
  if (!user) return null;
  return { id: String(user._id), email: user.email, name: user.name };
});
