"use client";

/**
 * 課程規劃幫手 — 共用匯出選單元件
 *
 * 修 Bug 紀錄：
 *   舊版（[requestId]/draft/page.tsx 內嵌的 ExportMenu）有兩個問題：
 *   1. 用 `<details>/<summary>` + `<Button asChild>` 包 dropdown，在某些瀏覽器
 *      會造成 click 事件被 Slot 吃掉，dropdown 不展開或 export 按鈕沒反應。
 *   2. `document.createElement("a")` 後沒 append 到 DOM 就 click()，且 click()
 *      下一行立刻 `URL.revokeObjectURL(url)` —— Chromium / Firefox 較新版本對
 *      這種「detached anchor + 立刻 revoke」的下載會 silent 失敗（瀏覽器還沒
 *      開始讀 blob URL，URL 就被 revoke）。
 *
 * 新版做法：
 *   - 用 React state 自己管 dropdown open/close（含 click outside 自動關閉）
 *   - 下載：`document.body.appendChild(a)` → `a.click()` → `removeChild(a)` →
 *     setTimeout 延後 1 秒再 revokeObjectURL
 *   - 新增 PNG 格式：client-side 拿 HTML → 隱藏 iframe 渲染 → html-to-image
 *     截圖 → 下載
 *   - 成功 / 失敗都 toast 給使用者明確回饋
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { Download, Loader2 } from "lucide-react";

export type ExportFormat = "markdown" | "html" | "json" | "docx" | "png";

interface Props {
  requestId: string;
  /** 卡片入口頁用 size="sm"；草案頁用預設 */
  size?: "default" | "sm";
  /** 卡片入口頁用 outline；草案頁用預設 */
  variant?: "default" | "outline";
  /** 自訂按鈕標籤（預設「匯出」）。卡片入口頁可改成「下載」 */
  label?: string;
}

const FORMAT_OPTIONS: { key: ExportFormat; label: string; hint?: string }[] = [
  { key: "markdown", label: "Markdown (.md)" },
  { key: "html", label: "HTML (.html)" },
  { key: "png", label: "PNG (.png)", hint: "整頁截圖" },
  { key: "docx", label: "Word (.doc)" },
  { key: "json", label: "JSON (.json)" },
];

export function ExportMenu({
  requestId,
  size = "default",
  variant = "outline",
  label = "匯出",
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // ─── click outside / Esc 關閉 ───
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (e.target instanceof Node && wrapRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  /**
   * 下載大型二進位檔（PNG / docx），用 blob URL。
   *
   * 修 Bug 3：原本 `setTimeout(revoke, 1500ms)` 太短。Chrome SafeBrowsing
   * 「Verify safe」掃描期間會回頭存取 source（blob URL），1.5s 內 verify 還
   * 沒結束就被 revoke → 檔案永遠卡 `.crdownload / 尚未確認`。延長到 60 秒。
   *
   * 對 text 類（md / html / json）改用下面 downloadTextDataUrl，根本繞過 blob
   * URL lifecycle，是 .crdownload 卡住的真正解法。
   */
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  /**
   * 下載 text blob，用 data URL（避開 Chrome SafeBrowsing 卡 .crdownload bug）。
   * 適用於 < 2MB 的小型 text。
   */
  const downloadTextBlob = async (blob: Blob, mime: string, filename: string) => {
    const text = await blob.text();
    const dataUrl = `data:${mime};charset=utf-8,${encodeURIComponent(text)}`;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ─── markdown / html / json / docx：直接打 server route ───
  const handleServerExport = useCallback(
    async (format: Exclude<ExportFormat, "png">) => {
      setBusy(format);
      try {
        const res = await fetch(`/api/course-planner/requests/${requestId}/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format }),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt.slice(0, 200) || `HTTP ${res.status}`);
        }

        const blob = await res.blob();
        const ext = format === "markdown" ? "md" : format === "docx" ? "doc" : format;
        const filenameFromHeader = parseFilenameFromHeader(res.headers.get("content-disposition"));
        const filename = filenameFromHeader || `course-plan-${requestId.slice(0, 8)}.${ext}`;
        // text 類用 data URL（避免 Chrome SafeBrowsing 卡 .crdownload）；
        // docx 是 binary，維持 blob URL（已將 revoke 拉長到 60s 防 verify 卡住）
        if (format === "markdown") {
          await downloadTextBlob(blob, "text/markdown", filename);
        } else if (format === "html") {
          await downloadTextBlob(blob, "text/html", filename);
        } else if (format === "json") {
          await downloadTextBlob(blob, "application/json", filename);
        } else {
          downloadBlob(blob, filename);
        }
        toast(`已下載 ${format.toUpperCase()}：${filename}`, "success");
      } catch (e) {
        console.error("[course-planner export] 失敗：", e);
        toast(`匯出失敗：${e instanceof Error ? e.message : "未知錯誤"}`, "error");
      } finally {
        setBusy(null);
        setOpen(false);
      }
    },
    [requestId, toast],
  );

  // ─── png：拿 server 產的 HTML → 隱藏 iframe 渲染 → html-to-image 截圖 ───
  const handlePngExport = useCallback(async () => {
    setBusy("png");
    let iframe: HTMLIFrameElement | null = null;
    try {
      // 1. 拿 HTML 字串（reuse 既有 export API 的 html 模式）
      const res = await fetch(`/api/course-planner/requests/${requestId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "html" }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt.slice(0, 200) || `HTTP ${res.status}`);
      }
      const html = await res.text();

      // 2. 建一個離螢幕 iframe 渲染這份 HTML
      iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-99999px";
      iframe.style.top = "0";
      iframe.style.width = "1024px";
      iframe.style.height = "100px";
      iframe.style.border = "0";
      iframe.style.opacity = "0";
      iframe.setAttribute("aria-hidden", "true");
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) throw new Error("無法存取 iframe document");
      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();

      // 3. 等 iframe 內 web font / image 載完
      // 注意：用 document.write 注入內容時，部分瀏覽器（Chromium / Safari）的
      // iframe load event 不會再觸發；用 readyState 判斷 + 3 秒 timeout 兜底，
      // 避免 PNG 處理一直卡在「處理中」永不返回。
      await new Promise<void>((resolve) => {
        if (iframeDoc.readyState === "complete") return resolve();
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        iframe!.addEventListener("load", finish, { once: true });
        setTimeout(finish, 3000);
      });
      // 多給瀏覽器一輪 layout（iframe 內 fonts.ready 不一定可靠）
      await new Promise<void>((r) => setTimeout(r, 200));
      try {
        if (iframeDoc.fonts && typeof iframeDoc.fonts.ready === "object") {
          await iframeDoc.fonts.ready;
        }
      } catch {
        /* 部分瀏覽器 iframe.fonts 可能無法存取，忽略 */
      }

      // 4. 把 iframe 撐到 body 的實際高度，避免截圖被切掉
      const body = iframeDoc.body;
      if (!body) throw new Error("iframe body 不存在");
      const fullHeight = Math.max(body.scrollHeight, body.offsetHeight, 800);
      iframe.style.height = `${fullHeight + 40}px`;
      await new Promise<void>((r) => setTimeout(r, 100));

      // 5. html-to-image 截圖
      const { toCanvas } = await import("html-to-image");
      const canvas = await toCanvas(body, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: true,
        skipFonts: true,
      });

      // 6. canvas → blob → 下載
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("無法產生 PNG blob"))),
          "image/png",
          1,
        );
      });
      const filename = `course-plan-${requestId.slice(0, 8)}.png`;
      downloadBlob(blob, filename);
      toast(`已下載 PNG：${filename}`, "success");
    } catch (e) {
      console.error("[course-planner export PNG] 失敗：", e);
      toast(`PNG 匯出失敗：${e instanceof Error ? e.message : "未知錯誤"}`, "error");
    } finally {
      if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
      setBusy(null);
      setOpen(false);
    }
  }, [requestId, toast]);

  const handleClickFormat = (format: ExportFormat) => {
    if (busy) return;
    if (format === "png") void handlePngExport();
    else void handleServerExport(format);
  };

  const buttonContent = busy ? (
    <>
      <Loader2 className={`${size === "sm" ? "h-3 w-3" : "h-4 w-4"} mr-1 animate-spin`} />
      匯出中…
    </>
  ) : (
    <>
      <Download className={`${size === "sm" ? "h-3 w-3" : "h-4 w-4"} mr-1`} />
      {label}
    </>
  );

  return (
    <div className="relative inline-block" ref={wrapRef}>
      <Button
        type="button"
        size={size}
        variant={variant}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (busy) return;
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {buttonContent}
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-[180px] overflow-hidden rounded-md border bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          {FORMAT_OPTIONS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="menuitem"
              disabled={busy != null}
              onClick={() => handleClickFormat(f.key)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
            >
              <span>{busy === f.key ? `${f.label} 處理中…` : f.label}</span>
              {f.hint && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500">{f.hint}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 從 Content-Disposition: attachment; filename="xxx.md" 抽 filename，失敗回 null */
function parseFilenameFromHeader(header: string | null): string | null {
  if (!header) return null;
  const m = header.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}
