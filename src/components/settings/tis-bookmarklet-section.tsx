"use client";

/**
 * 【TIS 頁面抓取器（Bookmarklet）使用說明】
 *
 * 顯示在 /settings 頁面，給管理員：
 *   1. 一段「拖到書籤列」的書籤連結（href = javascript:... 的 bookmarklet loader）
 *   2. 完整使用步驟
 *   3. 「複製 bookmarklet 程式碼」備用（書籤列已滿時手動建書籤）
 *
 * Bookmarklet loader 本身只負責「動態載入 /api/sync/tis/bookmarklet.js」，
 * 真正抓取邏輯都在那支 server-side 動態端點裡。這樣未來改邏輯不用使用者重存書籤。
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

  useEffect(() => {
    // 在 client 端推 origin，避免 SSR snapshot 寫死成 build-time 的 host
    setAppOrigin(window.location.origin);
  }, []);

  // 書籤本體：超短 loader，動態 inject 真正抓取 script
  const bookmarkletHref =
    appOrigin &&
    `javascript:(function(){var s=document.createElement('script');s.src=${JSON.stringify(
      appOrigin + "/api/sync/tis/bookmarklet.js"
    )}+'?_='+Date.now();s.onerror=function(){alert('載入抓取腳本失敗，請確認 ${appOrigin} 可連線');};document.body.appendChild(s);})();`;

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
          {bookmarkletHref ? (
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
