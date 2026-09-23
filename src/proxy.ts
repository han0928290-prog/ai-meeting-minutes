import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, decrypt } from "@/lib/session-token";

// 登入 / 註冊頁：已登入者會被導回工作台
const AUTH_PAGES = ["/login", "/signup"];
// 公開頁面：任何人都能看（landing page）
const PUBLIC_PAGES = ["/"];

// 樂觀檢查：只驗 cookie 簽章、不查資料庫。真正的權限檢查在 DAL 與每支 API 裡
export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAuthPage = AUTH_PAGES.includes(pathname);
  const isPublicPage = PUBLIC_PAGES.includes(pathname);
  const session = await decrypt(req.cookies.get(SESSION_COOKIE)?.value);

  if (!isAuthPage && !isPublicPage && !session) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  if (isAuthPage && session) {
    return NextResponse.redirect(new URL("/new", req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  // API 不經過 proxy：各 API 自行回 401，也避免 proxy 緩衝大型音檔上傳的 request body
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
