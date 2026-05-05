"use client";

/**
 * 【匯出面板】
 *
 * 提供 5 種匯出按鈕。
 *
 * ✦ 重要：DOM 來源不再是「正在編輯的 FormView / Canvas」，
 * 而是 AppShell 永遠掛載在畫面外的 ExportRenderer——
 * 那是 read-only 模式的全尺寸渲染（與「預覽」按鈕看到的版本同源），
 * 沒有 native form control、沒有 transform: scale 邊界裁切，
 * html2canvas 擷取後與「預覽」一模一樣。
 */
import * as React from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { useReportStore } from "../../store/reportStore";
import { FileText, FileImage, FileType, Presentation, Code2, Loader2 } from "lucide-react";
import { exportToPng } from "../../lib/export/toPng";
import { exportToPdf } from "../../lib/export/toPdf";
import { exportToHtml } from "../../lib/export/toHtml";
import { exportCanvasToDoc } from "../../lib/export/toDocxCanvas";
import { exportToPptx } from "../../lib/export/toPptx";
import { saveAs } from "file-saver";

interface Props {
  /**
   * 取得「給匯出用的 DOM」——亦即 ExportRenderer 的根節點。
   * AppShell 已確保它永遠存在；正常情況下不會回傳 null，
   * 但 SSR / 第一個 paint 之前仍可能短暫為 null，所以保留 null 處理。
   */
  getExportRoot: () => HTMLElement | null;
}

export function ExportPanel({ getExportRoot }: Props) {
  const report = useReportStore((s) => s.report);
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  const filename = report.title || "課程規劃報告";
  const isFormMode = report.mode === "form";

  const wrap = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    try {
      await fn();
    } catch (err) {
      toast(`匯出失敗：${err instanceof Error ? err.message : "未知錯誤"}`, "error");
    } finally {
      setBusy(null);
    }
  };

  /**
   * 取得「準備好擷取」的匯出 DOM。做兩件事：
   *
   *   1. 等一個 animation frame：使用者剛改完內容就按匯出時，Zustand 已觸發
   *      re-render，但 ExportRenderer 內部新的 layout 可能還沒 commit。
   *      等一拍能確保 html2canvas 拿到最新的位置與尺寸。
   *
   *   2. 等 web font 全部載入完成（document.fonts.ready）。
   *      原因：html2canvas 是用 canvas 2D context 重新排版整個 DOM，過程中
   *      會用「目前已載入的字型」量測寬度。如果 Noto Sans TC 還沒載入完，它
   *      會用 fallback（一般是 sans-serif 系統字），fallback 的字寬與行高
   *      都跟 Noto Sans TC 不一樣——這會讓標題或長中文段落出現位移、被切，
   *      與「預覽」看到的不符。
   *
   *      `document.fonts.ready` 是 Web Fonts API，所有現代瀏覽器都支援；
   *      若不存在（極舊環境）就直接跳過。
   */
  const getReadyExportRoot = async (): Promise<HTMLElement> => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch {
        // 忽略，繼續匯出（最多只是字型 fallback，不至於失敗）
      }
    }
    const node = getExportRoot();
    if (!node) throw new Error("找不到要匯出的內容（ExportRenderer 尚未就緒）");
    return node;
  };

  // PNG
  const onPng = () =>
    wrap("png", async () => {
      const node = await getReadyExportRoot();
      await exportToPng(node, filename);
      toast("已下載 PNG", "success");
    });

  // PDF
  const onPdf = () =>
    wrap("pdf", async () => {
      const node = await getReadyExportRoot();
      await exportToPdf(node, filename);
      toast("已下載 PDF", "success");
    });

  // DOCX：表單模式 → 真 DOCX；畫布模式 → HTML+MIME .doc
  const onDocx = () =>
    wrap("docx", async () => {
      if (isFormMode) {
        // 表單模式走伺服器端產生真正的 .docx；不需要 DOM
        const res = await fetch("/api/tools/course-report/export/docx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ report }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err?.error || `${res.status}`);
        }
        const blob = await res.blob();
        saveAs(blob, `${filename.replace(/[<>:"/\\|?*]/g, "_").slice(0, 60)}.docx`);
        toast("已下載 DOCX（可在 Word 完整編輯）", "success");
      } else {
        const node = await getReadyExportRoot();
        exportCanvasToDoc(node, filename, report.title || "課程規劃報告");
        toast("已下載 DOC（畫布版型；以 HTML+Word 相容方式輸出）", "success");
      }
    });

  // PPTX
  const onPptx = () =>
    wrap("pptx", async () => {
      const node = await getReadyExportRoot();
      await exportToPptx(report, node, filename);
      toast("已下載 PPTX", "success");
    });

  // HTML
  const onHtml = () =>
    wrap("html", async () => {
      const node = await getReadyExportRoot();
      exportToHtml(node, filename, report.title || "課程規劃報告");
      toast("已下載 HTML", "success");
    });

  return (
    <div className="space-y-2 px-1">
      <h3 className="mb-1 text-xs font-bold text-muted-foreground">匯出格式</h3>
      <ExportBtn icon={<FileType className="h-4 w-4" />} label={`下載 DOCX${isFormMode ? "（真 Word 文件）" : "（HTML 相容）"}`} busy={busy === "docx"} onClick={onDocx} />
      <ExportBtn icon={<FileText className="h-4 w-4" />} label="下載 PDF" busy={busy === "pdf"} onClick={onPdf} />
      <ExportBtn icon={<FileImage className="h-4 w-4" />} label="下載 PNG（單張圖）" busy={busy === "png"} onClick={onPng} />
      <ExportBtn icon={<Presentation className="h-4 w-4" />} label="下載 PPTX（簡報）" busy={busy === "pptx"} onClick={onPptx} />
      <ExportBtn icon={<Code2 className="h-4 w-4" />} label="下載 HTML（單檔可開）" busy={busy === "html"} onClick={onHtml} />
      <p className="mt-1 text-[10px] text-muted-foreground">
        {isFormMode
          ? "目前是制式表單模式：DOCX 為完全可編輯的 Word 文件；PPTX 會以表單截圖切片。"
          : "目前是自由畫布模式：DOCX 採 HTML+Word 相容方式；PPTX 會把每個元素轉成投影片元素。"}
      </p>
    </div>
  );
}

function ExportBtn({
  icon,
  label,
  busy,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={busy}
      className="h-8 w-full justify-start gap-2 text-xs"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </Button>
  );
}
