/**
 * 【TIS Bookmarklet 接收端點】POST
 *
 * 由 bookmarklet 動態產生的 form auto-submit 過來，body 是 application/x-www-form-urlencoded，
 * 唯一欄位 `payload` 是 JSON 字串，內含 `items: [{ name, content, sizeKb }, ...]`。
 *
 * 流程：
 *   1. 驗 next-auth session（瀏覽器自動帶 cookie；form submit + Lax 在 navigation 場景允許）
 *      → 未登入：redirect 到 /signin?callbackUrl=...，登入後讓使用者自己重打
 *   2. 簡單防呆：item count > 0 且 < 30、單筆 size < 2MB、總和 < 30MB
 *   3. 暫存到 TisIngestStaging（expiresAt = now + 1hr）
 *   4. 302 redirect 到 /sync?tisStagingId=<uuid>
 *
 * 為什麼不直接 ingest？
 *   要走兩階段：使用者必須在 /sync 頁面預覽 dry-run diff 後才能 confirm。
 *   把資料暫存到 DB 是因為 redirect 後 browser 不會重送 body，必須由 GET /staging/[id] 取回。
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MAX_ITEMS = 30;
const MAX_SINGLE_KB = 2048;
const MAX_TOTAL_KB = 30 * 1024;

interface IncomingItem {
  name?: unknown;
  content?: unknown;
  sizeKb?: unknown;
}

function htmlError(title: string, detail: string, backTo?: string): NextResponse {
  const safeTitle = title.replace(/[<>]/g, "");
  const safeDetail = detail.replace(/[<>]/g, "");
  const backHtml = backTo
    ? `<p><a href="${backTo}" style="color:#2563eb">← 返回 ${backTo}</a></p>`
    : "";
  return new NextResponse(
    `<!doctype html><html lang=zh-Hant><meta charset=utf-8><title>${safeTitle}</title>` +
      `<body style="font-family:system-ui,sans-serif;max-width:640px;margin:80px auto;padding:0 20px;color:#0f172a">` +
      `<h1 style="color:#dc2626">${safeTitle}</h1>` +
      `<p>${safeDetail}</p>${backHtml}` +
      `</body></html>`,
    {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" },
    }
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    // 未登入：先把使用者導到登入頁，登入後讓他自己再點一次書籤
    const url = new URL("/signin", req.url);
    url.searchParams.set("callbackUrl", "/sync");
    url.searchParams.set("flash", "請先登入再執行 TIS 一鍵抓取");
    return NextResponse.redirect(url, 303);
  }
  const userId = (session.user as { id?: string }).id;
  if (!userId) {
    return htmlError("無法辨識使用者", "Session 內缺少使用者 id，請重新登入。", "/sync");
  }

  let payloadRaw: string | null = null;
  try {
    const fd = await req.formData();
    const v = fd.get("payload");
    if (typeof v === "string") payloadRaw = v;
  } catch {
    return htmlError("讀取資料失敗", "form-data 解析失敗。請重新從 TIS 頁面點書籤。");
  }
  if (!payloadRaw) {
    return htmlError("缺少 payload", "Body 沒有 payload 欄位。Bookmarklet 可能執行錯誤。");
  }

  let parsed: { items?: IncomingItem[]; ua?: string; sourceUrl?: string };
  try {
    parsed = JSON.parse(payloadRaw);
  } catch {
    return htmlError("payload 非合法 JSON", "請更新 bookmarklet（先到 /settings 重新拖一次書籤）。");
  }

  const items = Array.isArray(parsed.items) ? parsed.items : [];
  if (items.length === 0) {
    return htmlError("沒有抓到任何資料", "Bookmarklet 回傳了 0 個 HTML；可能 TIS session 過期或被擋。", "/sync");
  }
  if (items.length > MAX_ITEMS) {
    return htmlError(
      "資料過多",
      `一次最多接收 ${MAX_ITEMS} 個 HTML，本次傳來 ${items.length} 個；請減少月份範圍。`,
      "/sync"
    );
  }

  const sanitized: Array<{ name: string; content: string; sizeKb: number }> = [];
  let totalKb = 0;
  for (const it of items) {
    const name = typeof it.name === "string" ? it.name.slice(0, 200) : "(unnamed)";
    const content = typeof it.content === "string" ? it.content : "";
    const sizeKb = Math.ceil(content.length / 1024);
    if (sizeKb > MAX_SINGLE_KB) {
      return htmlError(
        "單筆 HTML 過大",
        `${name} = ${sizeKb} KB（上限 ${MAX_SINGLE_KB} KB）；TIS 頁面異常或抓到非預期內容。`,
        "/sync"
      );
    }
    totalKb += sizeKb;
    if (totalKb > MAX_TOTAL_KB) {
      return htmlError("總資料量過大", `累計 ${totalKb} KB 超過 ${MAX_TOTAL_KB} KB 上限。`, "/sync");
    }
    sanitized.push({ name, content, sizeKb });
  }

  // 簡單檢查：是否真的像 TIS 開班計畫表頁
  const tisLikeCount = sanitized.filter((s) =>
    /OpenClass_ClassList2|開班計畫表/.test(s.content)
  ).length;
  if (tisLikeCount === 0) {
    return htmlError(
      "回傳內容不像 TIS 開班計畫表",
      "可能是 TIS session 過期被導到登入頁；請先在 TIS 頁面手動重新登入後再點書籤。",
      "/sync"
    );
  }

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  const staging = await prisma.tisIngestStaging.create({
    data: {
      createdBy: userId,
      payload: {
        items: sanitized,
        ua: typeof parsed.ua === "string" ? parsed.ua.slice(0, 500) : null,
        sourceUrl: typeof parsed.sourceUrl === "string" ? parsed.sourceUrl.slice(0, 500) : null,
      },
      itemCount: sanitized.length,
      totalKb,
      expiresAt,
    },
    select: { id: true },
  });

  const target = new URL("/sync", req.url);
  target.searchParams.set("tisStagingId", staging.id);
  return NextResponse.redirect(target, 303);
}
