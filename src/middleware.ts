/**
 * 【全域 Middleware】統一 API 認證攔截 + 速率限制
 * 免登入白名單：/api/auth（NextAuth）、靜態資源、登入頁
 *
 * 注意：Next.js middleware 預設在 Node.js runtime 下執行（非 Edge），
 * 因此 in-memory Map 在 dev 模式下可持久化。
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = ["/api/auth", "/api/health", "/login", "/_next", "/favicon.ico"];

/**
 * 不需要 next-auth cookie 但仍會經過 middleware（會套 rate limit）的 endpoint。
 * 這些 endpoint 會自己用其他方式認證（例如 form payload 內的個人 token）。
 *
 * - /api/sync/tis/bookmarklet-receive：來自 tis.cht.com.tw 的跨站 form POST，
 *   瀏覽器在 SameSite=Lax 規則下不會帶我們 domain 的 cookie，必須用 form 裡的
 *   bookmarklet token 認證；不能在 middleware 用 cookie 把它擋下（會回成 {"error":"未授權"}）。
 */
const TOKEN_AUTH_API_PATHS = ["/api/sync/tis/bookmarklet-receive"];

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;

const hitMap = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string): boolean {
  const now = Date.now();
  const entry = hitMap.get(key);

  if (!entry || now > entry.resetAt) {
    hitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  entry.count++;

  if (hitMap.size > 10000) {
    for (const [k, v] of hitMap) {
      if (now > v.resetAt) hitMap.delete(k);
    }
  }

  return entry.count <= RATE_LIMIT_MAX;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit(ip)) {
      return NextResponse.json(
        { error: "請求過於頻繁，請稍後再試" },
        { status: 429 }
      );
    }

    // 跳過 cookie 認證（這類 endpoint 自己會用 form payload 內的 token 驗）
    if (TOKEN_AUTH_API_PATHS.some((p) => pathname.startsWith(p))) {
      return NextResponse.next();
    }

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "未授權" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
