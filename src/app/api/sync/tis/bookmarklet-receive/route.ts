/**
 * 【TIS Bookmarklet 接收端點】POST
 *
 * 由 bookmarklet 動態產生的 form auto-submit 過來，body 是 application/x-www-form-urlencoded：
 *   - `payload`：JSON 字串，內含 `items: [{ name, content, sizeKb }, ...]`
 *   - `token`：個人 bookmarklet token（每位 user 一組，存在 user.bookmarkletToken）
 *
 * 認證：
 *   原本想用 next-auth cookie 認證，但跨站 form POST（從 tis.cht.com.tw 送過來）
 *   瀏覽器在 SameSite=Lax 規則下不會帶 cookie → 必然 401。
 *   所以改為 token 認證：bookmarklet 在 /api/sync/tis/bookmarklet.js 產生時就嵌入了該使用者的個人 token，
 *   這裡用 token 反查 user，完全不依賴 cookie。
 *
 * 流程：
 *   1. 從 form 拿 token → 反查 user（找不到 401，並建議去 /settings 重新拖書籤）
 *   2. 簡單防呆：item count > 0 且 < 30、單筆 size < 2MB、總和 < 30MB
 *   3. 暫存到 TisIngestStaging（expiresAt = now + 1hr）
 *   4. 303 redirect 到 /sync?tisStagingId=<uuid>
 *
 * 為什麼不直接 ingest？
 *   要走兩階段：使用者必須在 /sync 頁面預覽 dry-run diff 後才能 confirm。
 *   把資料暫存到 DB 是因為 redirect 後 browser 不會重送 body，必須由 GET /staging/[id] 取回。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findUserByBookmarkletToken } from "@/lib/tis/bookmarklet-token";

export const dynamic = "force-dynamic";

const MAX_ITEMS = 30;
const MAX_SINGLE_KB = 2048;
const MAX_TOTAL_KB = 30 * 1024;

interface IncomingItem {
  name?: unknown;
  content?: unknown;
  sizeKb?: unknown;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlError(title: string, detail: string, backTo?: string): NextResponse {
  // 預設 escape，避免未來 caller 帶外部資料時 XSS。
  // 對於需要保留已轉義 token（如除錯片段）的場景，請自行用 escHtml 後傳入；
  // 但一般用法只要傳純中文 / 數字字串即可。
  const safeTitle = escHtml(title);
  const safeDetail = escHtml(detail);
  const backHtml = backTo
    ? `<p style="margin-top:18px"><a href="${escHtml(backTo)}" style="color:#2563eb">← 返回 ${escHtml(backTo)}</a></p>`
    : "";
  return new NextResponse(
    `<!doctype html><html lang=zh-Hant><meta charset=utf-8><title>${safeTitle}</title>` +
      `<body style="font-family:system-ui,sans-serif;max-width:840px;margin:80px auto;padding:0 20px;color:#0f172a">` +
      `<h1 style="color:#dc2626">${safeTitle}</h1>` +
      `<pre style="white-space:pre-wrap;word-break:break-all;background:#f1f5f9;padding:12px;border-radius:6px;font-size:12px;line-height:1.5">${safeDetail}</pre>` +
      `${backHtml}` +
      `</body></html>`,
    {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" },
    }
  );
}

export async function POST(req: NextRequest) {
  let payloadRaw: string | null = null;
  let tokenRaw: string | null = null;
  try {
    const fd = await req.formData();
    const v = fd.get("payload");
    if (typeof v === "string") payloadRaw = v;
    const t = fd.get("token");
    if (typeof t === "string") tokenRaw = t;
  } catch {
    return htmlError("讀取資料失敗", "form-data 解析失敗。請重新從 TIS 頁面點書籤。");
  }

  if (!tokenRaw) {
    return htmlError(
      "缺少 token（舊版 bookmarklet）",
      "你的 bookmarklet 是舊版，沒有附帶個人 token。請到「系統設定」頁重新拖一次「📚 TIS→瑞士刀」到書籤列。",
      "/settings"
    );
  }
  const user = await findUserByBookmarkletToken(tokenRaw);
  if (!user) {
    return htmlError(
      "未授權",
      "bookmarklet token 無效或已被重置。請到「系統設定」頁重新拖一次「📚 TIS→瑞士刀」到書籤列。",
      "/settings"
    );
  }
  const userId = user.id;

  if (!payloadRaw) {
    return htmlError("缺少 payload", "Body 沒有 payload 欄位。Bookmarklet 可能執行錯誤。");
  }

  let parsed: { items?: IncomingItem[]; ua?: string; sourceUrl?: string };
  try {
    parsed = JSON.parse(payloadRaw);
  } catch (parseErr) {
    // 為了 debug，把 payload 樣本連同錯誤一起回給 user
    // （HTML escape 由 htmlError 統一處理；這裡只負責把不可見的控制字元換成 \xXX 才看得到）
    const visualize = (s: string) =>
      s.replace(/[\u0000-\u001f\u007f]/g, (c) => "\\x" + c.charCodeAt(0).toString(16).padStart(2, "0"));
    const len = payloadRaw.length;
    const head = visualize(payloadRaw.slice(0, 200));
    const tail = visualize(payloadRaw.slice(-200));
    const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    return htmlError(
      "payload 非合法 JSON",
      `JSON.parse error: ${errMsg}\n\n` +
        `payload 長度：${len} chars\n` +
        `前 200 字：\n${head}\n\n` +
        `後 200 字：\n${tail}`,
      "/settings"
    );
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
