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
 *
 * 【React 19 sanitizer 繞過】
 * React 19 會把 <a href="javascript:..."> 的 href 自動改寫成
 *   javascript:throw new Error("React has blocked a javascript: URL as a security precaution.")
 * 結果使用者拖到書籤列拿到的是這行 throw，根本不是真的 bookmarklet。
 * 解法：完全不把 href 當 prop 給 React，改用 useEffect + setAttribute 直接操作 DOM，
 * React 因 props 沒給 href 就不會去碰它，瀏覽器拖拉時拿到的就是真實的 javascript: URL。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bookmark, Copy, ExternalLink, Info, RefreshCw, KeyRound } from "lucide-react";
import { useToast } from "@/components/ui/toaster";

export function TisBookmarkletSection() {
  const { toast } = useToast();
  const [bookmarkletHref, setBookmarkletHref] = useState<string>("");
  const [loadingBookmarklet, setLoadingBookmarklet] = useState(true);
  const [bookmarkletError, setBookmarkletError] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const dragLinkRef = useRef<HTMLAnchorElement | null>(null);

  // 不能把 javascript: URL 當 prop 傳給 React 19（會被 sanitize 成 throw）。
  // 用 setAttribute 直接寫到 DOM 上，React 不會碰它，瀏覽器拖拉時拿到的才是真值。
  useEffect(() => {
    if (dragLinkRef.current && bookmarkletHref) {
      dragLinkRef.current.setAttribute("href", bookmarkletHref);
    }
  }, [bookmarkletHref]);

  /** 重新從 server 取得最新版（含個人 token）的 bookmarklet 並組成 javascript: URL */
  const reloadBookmarklet = useCallback(async () => {
    setLoadingBookmarklet(true);
    setBookmarkletError(null);
    try {
      const res = await fetch(`/api/sync/tis/bookmarklet.js?_=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const script = await res.text();
      // 將完整 script 內嵌到 bookmarklet。只移除換行，避免拖進書籤列時
      // 被部分瀏覽器截斷；不做 encodeURIComponent，因為某些瀏覽器不會在
      // javascript: URL 執行前完整 decode，可能變成點擊無反應。
      setBookmarkletHref(`javascript:${script.trim().replace(/\s*\n\s*/g, " ")}`);
    } catch (e) {
      setBookmarkletError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingBookmarklet(false);
    }
  }, []);

  useEffect(() => {
    void reloadBookmarklet();
  }, [reloadBookmarklet]);

  const copyCode = async () => {
    if (!bookmarkletHref) return;
    try {
      await navigator.clipboard.writeText(bookmarkletHref);
      toast("已複製 bookmarklet 程式碼，可手動建立書籤後貼到「網址」欄位", "success");
    } catch {
      toast("複製失敗", "error");
    }
  };

  const rotateToken = async () => {
    if (!confirm("確定重新產生 token？舊書籤會立即失效，需重新拖一次新書籤到書籤列。")) return;
    setRotating(true);
    try {
      const res = await fetch("/api/sync/tis/bookmarklet-token/rotate", {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await reloadBookmarklet();
      toast("已產生新 token，請重新拖下方紫色按鈕到書籤列覆蓋舊書籤", "success");
    } catch (e) {
      toast("重新產生 token 失敗：" + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setRotating(false);
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
              {/* React 19 會 block javascript: URL — 不能用 href prop，改在 useEffect 用 setAttribute 寫到 DOM */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages, jsx-a11y/anchor-is-valid */}
              <a
                ref={dragLinkRef}
                onClick={(e) => {
                  e.preventDefault();
                  toast(
                    "請『拖』到書籤列，不要點擊（在這個頁面點會被瀏覽器當成普通連結擋掉）",
                    "info"
                  );
                }}
                draggable
                title="拖到書籤列建立『TIS→瑞士刀』書籤"
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
                已改為「完整內嵌版 + 個人 token」bookmarklet，書籤內含你個人的認證 token，
                不再依賴 cookie session（避開跨站 form POST cookie 被瀏覽器擋的問題）。
              </p>
              <div className="mt-3 pt-3 border-t border-purple-200/60 flex items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={rotateToken}
                  disabled={rotating || loadingBookmarklet}
                  className="text-xs"
                >
                  {rotating ? (
                    <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <KeyRound className="w-3 h-3 mr-1" />
                  )}
                  重新產生 token（舊書籤失效）
                </Button>
              </div>
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
              <strong>個人 token 認證</strong>：書籤內含你個人的認證 token，所以「拖到書籤列」這個動作必須在你
              本人帳號登入下完成。若 token 被別人拷貝，請點上方「重新產生 token」讓舊書籤失效。
            </p>
            <p>
              <strong>抓完後不需再登入</strong>：抓取流程不依賴本系統 cookie session，但回到 <code>/sync</code> 預覽頁時
              仍需要瀏覽器有效 session；若過期會被導到登入頁，登入後 staging 資料仍會保留 1 小時。
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
