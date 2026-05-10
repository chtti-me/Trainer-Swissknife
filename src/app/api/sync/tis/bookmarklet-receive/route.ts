/**
 * 【TIS Bookmarklet 接收端點】POST + OPTIONS
 *
 * 來源：tis.cht.com.tw 的 cross-site fetch POST，body 是 multipart/form-data：
 *   - `token`：個人 bookmarklet token（每位 user 一組，存在 user.bookmarkletToken）
 *   - `ua`、`sourceUrl`：metadata
 *   - `html`：可重複；每個 part 是一份 HTML File（filename 是月份 .html，type 是 text/html）
 *
 * 演進歷史（為什麼長成這樣）：
 *   v1: 用 form auto-submit + JSON.stringify 整包 payload 進 hidden input
 *       → cookie 被 SameSite=Lax 擋掉，401
 *   v2: 改用 token 認證；form 仍 auto-submit + JSON 字串
 *       → 大 payload 用 application/x-www-form-urlencoded 編碼後膨脹 3 倍 + 各層轉碼問題
 *   v3: enctype 改 multipart/form-data，仍 JSON 字串
 *       → 「Bad escaped character at position 2665」：r.text() 預設用 UTF-8 解碼 TIS 的 Big5
 *         頁面，破壞了某些 byte → 後續 JSON.stringify 產生不合法 escape 序列
 *   v4 (本版): 完全跳過 JSON 字串化
 *       - bookmarklet 端用 r.arrayBuffer() 拿原始 bytes
 *       - 每個 HTML 包成 Blob 當 multipart File part 上傳（binary safe，零編碼）
 *       - 改用 fetch 而非 form auto-submit，能拿到 server 回應 stagingId 後 window.open
 *       - 必須開 CORS（Access-Control-Allow-Origin tis.cht.com.tw）才能讓 client 讀到回應
 *
 * 認證：用 form 內 token 反查 user，不依賴 cookie。
 *
 * 回應：成功時 200 + JSON { stagingId }；失敗時 4xx + JSON { error, detail }。
 *       client 拿到 stagingId 後，自己 window.open(`/sync?tisStagingId=...`)。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findUserByBookmarkletToken } from "@/lib/tis/bookmarklet-token";

export const dynamic = "force-dynamic";

const MAX_ITEMS = 30;
const MAX_SINGLE_KB = 2048;
const MAX_TOTAL_KB = 30 * 1024;

const ALLOWED_ORIGIN = "https://tis.cht.com.tw";

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "600",
  };
}

function jsonErr(status: number, error: string, detail?: string): NextResponse {
  return NextResponse.json(
    { error, detail },
    { status, headers: corsHeaders() }
  );
}

export async function OPTIONS() {
  // CORS preflight。multipart/form-data 是 simple request，理論上瀏覽器不會發 preflight，
  // 但保險起見仍實作（例如 fetch 加了非 simple header 時會 trigger）。
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch (e) {
    return jsonErr(400, "form-data 解析失敗", e instanceof Error ? e.message : String(e));
  }

  const tokenRaw = fd.get("token");
  if (typeof tokenRaw !== "string" || !tokenRaw) {
    return jsonErr(401, "缺少 token", "請到「系統設定」頁重新拖一次「📚 TIS→瑞士刀」到書籤列。");
  }

  const user = await findUserByBookmarkletToken(tokenRaw);
  if (!user) {
    return jsonErr(401, "未授權", "bookmarklet token 無效或已被重置。請到「系統設定」頁重新拖一次新書籤。");
  }
  const userId = user.id;

  // 取所有 html parts
  const htmlEntries = fd.getAll("html");
  if (htmlEntries.length === 0) {
    return jsonErr(400, "沒有抓到任何 HTML", "Bookmarklet 回傳了 0 個 HTML；可能 TIS session 過期或被擋。");
  }
  if (htmlEntries.length > MAX_ITEMS) {
    return jsonErr(400, "資料過多", `一次最多接收 ${MAX_ITEMS} 個 HTML，本次傳來 ${htmlEntries.length} 個。`);
  }

  const sanitized: Array<{ name: string; content: string; sizeKb: number }> = [];
  let totalKb = 0;

  for (const entry of htmlEntries) {
    if (typeof entry === "string") {
      // 不應該發生（client 一律包成 Blob），但保險起見
      const sizeKb = Math.ceil(entry.length / 1024);
      sanitized.push({ name: "(string)", content: entry, sizeKb });
      totalKb += sizeKb;
      continue;
    }
    const file = entry as File;
    const name = (file.name || "(unnamed)").slice(0, 200);
    // 用 ArrayBuffer 拿到原始 bytes，用 BOM / meta tag 偵測 charset 後 decode
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const sizeKb = Math.ceil(bytes.byteLength / 1024);
    if (sizeKb > MAX_SINGLE_KB) {
      return jsonErr(400, "單筆 HTML 過大", `${name} = ${sizeKb} KB（上限 ${MAX_SINGLE_KB} KB）；TIS 頁面異常或抓到非預期內容。`);
    }
    totalKb += sizeKb;
    if (totalKb > MAX_TOTAL_KB) {
      return jsonErr(400, "總資料量過大", `累計 ${totalKb} KB 超過 ${MAX_TOTAL_KB} KB 上限。`);
    }
    const content = decodeHtmlBytes(bytes);
    sanitized.push({ name, content, sizeKb });
  }

  // 簡單檢查：是否真的像 TIS 開班計畫表頁
  const tisLikeCount = sanitized.filter((s) =>
    /OpenClass_ClassList2|開班計畫表/.test(s.content)
  ).length;
  if (tisLikeCount === 0) {
    return jsonErr(
      400,
      "回傳內容不像 TIS 開班計畫表",
      "可能是 TIS session 過期被導到登入頁；請先在 TIS 頁面手動重新登入後再點書籤。"
    );
  }

  const ua = fd.get("ua");
  const sourceUrl = fd.get("sourceUrl");

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const staging = await prisma.tisIngestStaging.create({
    data: {
      createdBy: userId,
      payload: {
        items: sanitized,
        ua: typeof ua === "string" ? ua.slice(0, 500) : null,
        sourceUrl: typeof sourceUrl === "string" ? sourceUrl.slice(0, 500) : null,
      },
      itemCount: sanitized.length,
      totalKb,
      expiresAt,
    },
    select: { id: true },
  });

  return NextResponse.json(
    { stagingId: staging.id, itemCount: sanitized.length, totalKb },
    { status: 200, headers: corsHeaders() }
  );
}

/**
 * 從 raw bytes 偵測 HTML charset 並解碼成字串。
 *
 * TIS 開班計畫表頁面 (jap/OpenClass/OpenClass_ClassList2.jsp) 是經典的 BIG5 / windows-950 編碼。
 * 流程：先掃 meta charset；找不到就根據 byte 模式猜（UTF-8 BOM / valid UTF-8 / 否則用 Big5）。
 * 用 Node 內建 TextDecoder（支援 'big5' / 'utf-8' 等標準 encoding label）。
 */
function decodeHtmlBytes(bytes: Uint8Array): string {
  // 先用 ASCII 解前 4KB（charset 宣告通常在 <head> 開頭）
  const headPlain = new TextDecoder("ascii").decode(bytes.subarray(0, Math.min(bytes.byteLength, 4096)));
  let charset: string | null = null;
  // 1. <meta http-equiv="Content-Type" content="text/html; charset=big5">
  const m1 = headPlain.match(/<meta[^>]+content\s*=\s*["'][^"']*charset=([^"';\s]+)/i);
  if (m1) charset = m1[1].toLowerCase();
  // 2. <meta charset="big5">
  if (!charset) {
    const m2 = headPlain.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i);
    if (m2) charset = m2[1].toLowerCase();
  }
  // 3. 沒宣告：UTF-8 BOM 優先
  if (!charset && bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    charset = "utf-8";
  }
  // 4. 沒宣告也沒 BOM：TIS 預設 big5
  if (!charset) charset = "big5";

  // alias 正規化
  if (/^(big5|big5-hkscs|cp950|windows-950|ms950)$/i.test(charset)) charset = "big5";
  if (/^utf-?8$/i.test(charset)) charset = "utf-8";

  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    // 若 runtime 不支援該 encoding，退回 utf-8（會有亂碼但至少不丟資料）
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}
