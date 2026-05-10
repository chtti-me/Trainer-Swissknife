"use client";

/**
 * 【TIS 頁面抓取器（Bookmarklet）使用說明】
 *
 * 顯示在 /settings 頁面，給管理員：
 *   1. 一段「拖到書籤列」的書籤連結（href = javascript:... 的完整 bookmarklet）
 *   2. 完整使用步驟
 *   3. 「複製 bookmarklet 程式碼」備用（書籤列已滿時手動建書籤）
 *
 * 注意：不能只做「動態載入外部 script」的 loader。TIS 頁面很可能有 CSP
 *（Content Security Policy，內容安全政策）擋跨站 script src，使用者會看到「點了沒反應」。
 * 所以本元件會先從 /api/sync/tis/bookmarklet.js 抓完整程式碼，再把整段塞進
 * javascript: URL；書籤在 TIS 頁面執行時不需要載入外部 script。
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bookmark, Copy, ExternalLink, Info } from "lucide-react";
import { useToast } from "@/components/ui/toaster";

export function TisBookmarkletSection() {
  const { toast } = useToast();
  const [appOrigin, setAppOrigin] = useState<string>("");
  const [bookmarkletHref, setBookmarkletHref] = useState<string>("");
  const [loadingBookmarklet, setLoadingBookmarklet] = useState(true);
  const [bookmarkletError, setBookmarkletError] = useState<string | null>(null);

  useEffect(() => {
    // 在 client 端推 origin，避免 SSR snapshot 寫死成 build-time 的 host
    const origin = window.location.origin;
    setAppOrigin(origin);

    let cancelled = false;
    (async () => {
      setLoadingBookmarklet(true);
      setBookmarkletError(null);
      try {
        const res = await fetch(`/api/sync/tis/bookmarklet.js?_=${Date.now()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const script = await res.text();
        if (cancelled) return;
        // 將完整 script 內嵌到 bookmarklet。只移除換行，避免拖進書籤列時
        // 被部分瀏覽器截斷；不做 encodeURIComponent，因為某些瀏覽器不會在
        // javascript: URL 執行前完整 decode，可能變成點擊無反應。
        setBookmarkletHref(`javascript:${script.trim().replace(/\s*\n\s*/g, " ")}`);
      } catch (e) {
        if (!cancelled) setBookmarkletError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoadingBookmarklet(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const copyCode = async () => {
    if (!bookmarkletHref) return;
    try {
      await navigator.clipboard.writeText(bookmarkletHref);
      toast("已複製 bookmarklet 程式碼，可手動建立書籤後貼到「網址」欄位", "success");
    } catch {
      toast("複製失敗", "error");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-purple-600" />
          TIS 頁面抓取器（Bookmarklet）
          <Badge className="bg-green-100 text-green-800 ml-1">已啟用</Badge>
        </CardTitle>
        <CardDescription>
          在 TIS 頁面點一次書籤，自動抓回全年 12 個月份開班計畫表並送進本系統，省去逐月另存 HTML 的麻煩。
          所有抓取都在 <strong>使用者瀏覽器</strong>內進行（同源 fetch），server 不會接觸 TIS 帳密或 session。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {/* 主體：拖到書籤列的連結 */}
        <div className="border-2 border-dashed border-purple-300 bg-purple-50/40 rounded-lg p-4 text-center">
          {loadingBookmarklet ? (
            <p className="text-xs text-muted-foreground">正在產生完整 bookmarklet…</p>
          ) : bookmarkletError ? (
            <div className="space-y-2">
              <p className="text-xs text-rose-700">
                產生 bookmarklet 失敗：{bookmarkletError}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
              >
                重新整理再試
              </Button>
            </div>
          ) : bookmarkletHref ? (
            <>
              <p className="text-xs text-muted-foreground mb-3">
                把下方紫色按鈕<strong>拖到瀏覽器書籤列</strong>，命名建議「TIS→瑞士刀」
              </p>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href={bookmarkletHref}
                onClick={(e) => {
                  e.preventDefault();
                  toast(
                    "請『拖』到書籤列，不要點擊（在這個頁面點會被瀏覽器當成普通連結擋掉）",
                    "info"
                  );
                }}
                draggable
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-purple-600 text-white font-semibold cursor-grab active:cursor-grabbing shadow-md hover:bg-purple-700 transition no-underline"
              >
                <Bookmark className="w-4 h-4" />
                📚 TIS→瑞士刀
              </a>
              <p className="text-[11px] text-muted-foreground mt-3">
                或
                <button
                  type="button"
                  onClick={copyCode}
                  className="inline-flex items-center gap-1 mx-2 text-primary hover:underline"
                >
                  <Copy className="w-3 h-3" />
                  複製 bookmarklet 程式碼
                </button>
                後手動建立書籤（書籤名稱隨意，網址欄位貼上即可）
              </p>
              <p className="text-[11px] text-muted-foreground mt-2">
                已改為「完整內嵌版」bookmarklet，不再從 TIS 頁面載入外部 script，
                可避開 TIS 的 CSP 擋跨站 script 問題。
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">準備中…</p>
          )}
        </div>

        {/* 使用步驟 */}
        <div className="space-y-2">
          <p className="font-medium text-xs text-muted-foreground">使用步驟</p>
          <ol className="list-decimal list-inside space-y-1.5 text-sm pl-2">
            <li>
              將上方「📚 TIS→瑞士刀」按鈕<strong>拖到瀏覽器書籤列</strong>（拖到網址列下方那條）
            </li>
            <li>
              開新分頁前往
              <a
                href="https://tis.cht.com.tw/jap/tis2index.jsp"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline mx-1 inline-flex items-center gap-0.5"
              >
                TIS 首頁 <ExternalLink className="w-3 h-3" />
              </a>
              並登入（用你公司帳號）
            </li>
            <li>
              登入後隨便開一個 TIS 頁面（例如「
              <a
                href="https://tis.cht.com.tw/jap/OpenClass/DirectorMenu.jsp"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                導師作業
              </a>
              」），點一下書籤列上的「📚 TIS→瑞士刀」
            </li>
            <li>
              畫面右上角會跳出懸浮面板：選年份 / 月份範圍 / 院所代碼 → 點「開始抓取」
            </li>
            <li>
              抓完後自動開新分頁送回本系統，會直接帶你到{" "}
              <code className="bg-muted px-1 rounded">/sync</code>{" "}
              預覽差異 → 確認匯入即可
            </li>
          </ol>
        </div>

        {/* 限制與注意 */}
        <div className="text-xs bg-amber-50 border border-amber-300 rounded p-3 flex gap-2">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
          <div className="space-y-1 text-amber-900">
            <p>
              <strong>必須先在 TIS 登入</strong>：書籤靠瀏覽器自動帶 TIS session cookie；未登入會抓到 TIS 登入頁，
              系統會提示「不像 TIS 開班計畫表」。
            </p>
            <p>
              <strong>院所權限</strong>：依你 TIS 帳號權限可抓的範圍而定。一般導師只能看院本部（P）。
            </p>
            <p>
              <strong>必須先在本系統登入</strong>：抓完後新分頁會帶你回本系統，若 next-auth session 過期，
              系統會把你導到登入頁，登入完成後請再重新點一次書籤。
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
