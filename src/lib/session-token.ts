import { SignJWT, jwtVerify } from "jose";

// 只做 JWT 簽發 / 驗證，不碰 cookies，讓 proxy 與 server 程式碼都能共用

export const SESSION_COOKIE = "session";
export const SESSION_DAYS = 7;

export type SessionPayload = { userId: string };

function getKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("請在 .env.local 設定 SESSION_SECRET");
  return new TextEncoder().encode(secret);
}

export async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getKey());
}

// 驗證失敗（竄改、過期、格式錯誤）一律回傳 null
export async function decrypt(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ["HS256"] });
    return typeof payload.userId === "string" ? { userId: payload.userId } : null;
  } catch {
    return null;
  }
}
