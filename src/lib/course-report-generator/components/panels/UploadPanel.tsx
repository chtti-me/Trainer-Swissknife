"use client";

/**
 * 【課程規劃報告產生器 - 上傳/AI 解析面板】
 *
 * 左側面板，使用者於此：
 *   1. 拖放或選擇多個檔案（docx/pdf/png/jpg/html/xlsx/csv/txt）
 *   2. 貼上純文字筆記
 *   3. 提供 TIS 開班計畫表 URL
 *   4. 按「AI 解析並填入報告」→ 後端走 /ai/extract → patch 進 reportStore
 *
 * 檔案二進位儲存策略：
 *   - 文字檔/Word/PDF 等 → 上傳給 server 解析為純文字後丟掉 Blob
 *     （Blob 還是會丟進 IndexedDB 一份，方便事後在報告中重新插入圖片）
 *   - 圖片 → 直接 base64 給 AI extract（多模態），同時 Blob 存 IDB 方便插入
 */
import * as React from "react";
import { Upload, FileText, Image as ImageIcon, Globe, Sparkles, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import { useReportStore } from "../../store/reportStore";
import { useUiStore } from "../../store/uiStore";
import {
  aiExtract,
  fetchUrl,
  parseUploadFile,
  type ExtractInput,
} from "../../lib/client/api";
import {
  blobToBase64,
  getExt,
  isImageExt,
  newId,
} from "../../lib/utils";
import { saveFile } from "../../lib/storage/idb";
import type { UploadedFileMeta } from "../../types/report";

interface Props {
  userId: string;
  /**
   * AI 解析完成（成功）後呼叫；通常給浮層選單關閉自己用。
   * 失敗時不會觸發，使用者仍可看到原本的對話框繼續調整。
   */
  onAfterAiExtract?: () => void;
}

const ACCEPT_EXTS = ".txt,.docx,.pdf,.xlsx,.csv,.html,.htm,.png,.jpg,.jpeg,.gif,.webp";

export function UploadPanel({ userId, onAfterAiExtract }: Props) {
  const { toast } = useToast();
  const report = useReportStore((s) => s.report);
  const addUpload = useReportStore((s) => s.addUpload);
  const removeUpload = useReportStore((s) => s.removeUpload);
  const setNotes = useReportStore((s) => s.setNotes);
  const setTisUrl = useReportStore((s) => s.setTisUrl);
  const setTitle = useReportStore((s) => s.setTitle);
  const applyAiExtract = useReportStore((s) => s.applyAiExtract);
  const setAiBusy = useUiStore((s) => s.setAiBusy);
  const aiBusy = useUiStore((s) => s.aiBusy);

  const [titleHint, setTitleHint] = React.useState(report.title);
  const [urlInput, setUrlInput] = React.useState(report.tisUrl ?? "");
  const [cookieInput, setCookieInput] = React.useState("");
  const [fetchedUrl, setFetchedUrl] = React.useState<{ url: string; title: string; text: string } | null>(null);
  const [fetchBusy, setFetchBusy] = React.useState(false);
  const [parsing, setParsing] = React.useState(false);
  const [overwriteAll, setOverwriteAll] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // ─────────────── 上傳檔案 ───────────────
  const handleFiles = async (files: FileList | File[]) => {
    if (!files || (files instanceof FileList ? files.length === 0 : files.length === 0)) return;
    const arr = Array.from(files);
    setParsing(true);
    try {
      for (const f of arr) {
        const ext = getExt(f.name).toLowerCase();
        const fileId = newId();
        // 存 Blob 到 IDB（事後可重插入畫布）
        try {
          await saveFile(userId, fileId, f);
        } catch (err) {
          console.warn("saveFile 失敗：", err);
        }

        let extractedText = "";
        if (!isImageExt(ext)) {
          // 走 server parse-uploads
          try {
            const r = await parseUploadFile(f);
            extractedText = r.text;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toast(`解析「${f.name}」失敗：${msg}`, "error");
            continue;
          }
        }

        const meta: UploadedFileMeta = {
          id: fileId,
          name: f.name,
          type: f.type,
          size: f.size,
          ext,
          extractedText,
          uploadedAt: new Date().toISOString(),
        };
        addUpload(meta);
        toast(`已加入：${f.name}`, "success");
      }
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ─────────────── 拖放區 ───────────────
  const [dragOver, setDragOver] = React.useState(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files);
    }
  };

  // ─────────────── URL 抓取 ───────────────
  const handleFetchUrl = async () => {
    const u = urlInput.trim();
    if (!u) {
      toast("請先輸入 URL", "error");
      return;
    }
    setFetchBusy(true);
    try {
      const r = await fetchUrl(u, cookieInput.trim() || undefined);
      setFetchedUrl(r);
      setTisUrl(u);
      toast(`已抓取網頁：${r.title || r.url}`, "success");
    } catch (err) {
      toast(`抓取失敗：${err instanceof Error ? err.message : "未知錯誤"}`, "error");
    } finally {
      setFetchBusy(false);
    }
  };

  // ─────────────── AI 解析 ───────────────
  const handleAiExtract = async () => {
    if (aiBusy) return;
    if (titleHint && titleHint !== report.title && !report.title) setTitle(titleHint);

    const parsedTexts = report.uploads
      .filter((u) => u.extractedText && u.extractedText.length > 0)
      .map((u) => ({ filename: u.name, text: u.extractedText! }));

    // 圖片 → base64（從 IDB 讀回）
    const imageMetas = report.uploads.filter((u) => isImageExt(u.ext));
    const images: ExtractInput["images"] = [];
    for (const m of imageMetas.slice(0, 6)) {
      try {
        const { loadFile } = await import("../../lib/storage/idb");
        const blob = await loadFile(userId, m.id);
        if (!blob) continue;
        const base64 = await blobToBase64(blob);
        images.push({ filename: m.name, mimeType: m.type || "image/png", base64 });
      } catch (err) {
        console.warn("讀取圖片失敗：", err);
      }
    }

    if (parsedTexts.length === 0 && images.length === 0 && !report.notes && !fetchedUrl) {
      toast("請至少上傳一份檔案、貼上一段文字筆記，或抓取一個 URL", "error");
      return;
    }

    setAiBusy(true);
    try {
      const result = await aiExtract({
        userTitle: titleHint || report.title || undefined,
        userNotes: report.notes || undefined,
        parsedTexts: parsedTexts.length > 0 ? parsedTexts : undefined,
        fetchedUrl: fetchedUrl ?? undefined,
        images: images.length > 0 ? images : undefined,
        reporter: report.reporter || undefined,
        department: report.department || undefined,
      });
      applyAiExtract(result, { overwriteAll });
      toast("AI 解析完成，已自動填入報告欄位", "success");
      if (result.notes) {
        toast(`AI 補充說明：${result.notes.slice(0, 80)}…`, "info");
      }
      // 解析成功後關閉浮層（如有提供 callback），讓使用者直接看到剛被填入的報告
      onAfterAiExtract?.();
    } catch (err) {
      toast(`AI 解析失敗：${err instanceof Error ? err.message : "未知錯誤"}`, "error");
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <header className="shrink-0 px-1">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Upload className="h-4 w-4" /> 上傳資料 + AI 解析
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          支援多檔案、文字筆記、TIS 網址。AI 會綜合萃取為報告草稿。
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1 pb-2">
        {/* 標題提示 */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">標題提示（給 AI 參考）</label>
          <Input
            value={titleHint}
            onChange={(e) => setTitleHint(e.target.value)}
            placeholder="例：2026 Q2 資訊學系 AI 應用培訓系列"
            className="h-8 text-sm"
          />
        </div>

        {/* 拖放區 */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-3 py-6 text-center text-xs transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          }`}
        >
          <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
          <div className="font-medium">拖放或點擊上傳檔案</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            支援 docx / pdf / xlsx / csv / html / 圖片
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_EXTS}
            multiple
            hidden
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </div>

        {parsing && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> 解析中…
          </div>
        )}

        {/* 已上傳檔案清單 */}
        {report.uploads.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-muted-foreground">已上傳（{report.uploads.length}）</div>
            <ul className="space-y-1">
              {report.uploads.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-xs"
                >
                  {isImageExt(u.ext) ? (
                    <ImageIcon className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                  )}
                  <div className="min-w-0 flex-1 truncate" title={u.name}>
                    {u.name}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {(u.size / 1024).toFixed(0)}KB
                  </span>
                  <button
                    type="button"
                    title="移除"
                    onClick={async () => {
                      const { deleteFile } = await import("../../lib/storage/idb");
                      await deleteFile(userId, u.id);
                      removeUpload(u.id);
                    }}
                    className="rounded p-0.5 hover:bg-destructive/10"
                  >
                    <X className="h-3 w-3 text-destructive" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 文字筆記 */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">文字筆記（選填）</label>
          <Textarea
            value={report.notes ?? ""}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="貼上你的備忘錄、開班想法、過去經驗、希望強調的重點..."
            rows={4}
            className="text-xs"
          />
        </div>

        {/* TIS URL */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">TIS 開班計畫表 URL（選填）</label>
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://tis.cht.com.tw/..."
            className="h-8 text-xs"
          />
          <Textarea
            value={cookieInput}
            onChange={(e) => setCookieInput(e.target.value)}
            placeholder="若需登入，可貼 Cookie 字串（選填）"
            rows={2}
            className="text-xs"
          />
          <div className="flex items-center gap-2">
            <Button onClick={handleFetchUrl} disabled={fetchBusy || !urlInput} size="sm" variant="outline" className="h-7 text-xs">
              {fetchBusy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Globe className="mr-1 h-3 w-3" />}
              抓取網頁
            </Button>
            {fetchedUrl && (
              <span className="flex-1 truncate text-[11px] text-muted-foreground" title={fetchedUrl.title || fetchedUrl.url}>
                ✓ {fetchedUrl.title || fetchedUrl.url}
              </span>
            )}
            {fetchedUrl && (
              <button
                type="button"
                title="移除已抓取的網頁"
                onClick={() => {
                  setFetchedUrl(null);
                  setTisUrl("");
                }}
                className="rounded p-0.5 hover:bg-destructive/10"
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* AI 解析按鈕 */}
      <div className="shrink-0 space-y-2 border-t bg-card p-2">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={overwriteAll}
            onChange={(e) => setOverwriteAll(e.target.checked)}
          />
          <span>覆蓋所有欄位（已填寫的內容會被替換）</span>
        </label>
        <Button onClick={handleAiExtract} disabled={aiBusy} className="w-full gap-2">
          {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {aiBusy ? "AI 正在解析…" : "AI 解析並填入報告"}
        </Button>
      </div>
    </div>
  );
}
