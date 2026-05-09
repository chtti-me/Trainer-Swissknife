"use client";

/**
 * 在 AI 對話訊息流中渲染 Excalidraw 場景。
 * - 預設：320px 高的唯讀預覽（viewModeEnabled），可拖動、縮放、但不能編輯
 * - 點「全屏編輯」開 modal：完整 Excalidraw（含原生工具列，可編輯／下載 PNG／SVG／JSON）
 * - 預覽列直接提供四個快捷：下載 PNG、下載 SVG、複製 .excalidraw JSON、（mermaid 來源）複製 Mermaid 原始碼
 * - SSR 不安全（會碰 window/document），用 next/dynamic + ssr:false 包起來
 */

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { saveAs } from "file-saver";
import {
  Pencil,
  Maximize2,
  X,
  Eye,
  Image as ImageIcon,
  FileCode2,
  ClipboardCopy,
  ClipboardCheck,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import "@excalidraw/excalidraw/index.css";

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[320px] bg-muted/40 rounded-lg text-xs text-muted-foreground">
        載入 Excalidraw 中…
      </div>
    ),
  }
);

interface ExcalidrawScene {
  type?: string;
  version?: number;
  source?: string;
  elements?: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

export interface ExcalidrawMessageProps {
  title: string;
  scene: ExcalidrawScene;
  /** 內嵌預覽高度，預設 320 */
  previewHeight?: number;
  /** 若來源是 Mermaid，附上原始 mermaid 程式碼，會多顯示「複製 Mermaid」按鈕 */
  mermaidCode?: string;
}

type CopyTarget = "json" | "mermaid";
type ExportTarget = "png" | "svg";

function safeFilename(name: string): string {
  const trimmed = (name || "diagram").trim();
  return trimmed.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) || "diagram";
}

export function ExcalidrawMessage({
  title,
  scene,
  previewHeight = 320,
  mermaidCode,
}: ExcalidrawMessageProps) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [exporting, setExporting] = useState<ExportTarget | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const elements = Array.isArray(scene.elements) ? scene.elements : [];
  // Excalidraw props are loosely typed when imported via next/dynamic; cast to any for the
  // initialData object, since SSR-safe rendering happens client-side only.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialData: any = {
    elements,
    appState: {
      viewBackgroundColor: "#ffffff",
      ...(scene.appState || {}),
    },
    files: scene.files || {},
    scrollToContent: true,
  };

  const closeEditor = useCallback(() => setEditing(false), []);

  const flashCopy = useCallback((target: CopyTarget) => {
    setCopied(target);
    setTimeout(() => setCopied((prev) => (prev === target ? null : prev)), 1500);
  }, []);

  const reportError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 3000);
  }, []);

  const handleExportPng = useCallback(async () => {
    if (exporting) return;
    setExporting("png");
    setErrorMsg(null);
    try {
      const { exportToBlob } = await import("@excalidraw/excalidraw");
      const blob = await exportToBlob({
        elements: elements as Parameters<typeof exportToBlob>[0]["elements"],
        appState: {
          ...(scene.appState as Record<string, unknown>),
          exportBackground: true,
          exportWithDarkMode: false,
          viewBackgroundColor:
            (scene.appState?.viewBackgroundColor as string) || "#ffffff",
        } as Parameters<typeof exportToBlob>[0]["appState"],
        files: (scene.files || null) as Parameters<typeof exportToBlob>[0]["files"],
        mimeType: "image/png",
        exportPadding: 16,
      });
      saveAs(blob, `${safeFilename(title)}.png`);
    } catch (e) {
      reportError(`匯出 PNG 失敗：${(e as Error).message}`);
    } finally {
      setExporting(null);
    }
  }, [elements, scene.appState, scene.files, title, exporting, reportError]);

  const handleExportSvg = useCallback(async () => {
    if (exporting) return;
    setExporting("svg");
    setErrorMsg(null);
    try {
      const { exportToSvg } = await import("@excalidraw/excalidraw");
      const svgEl = await exportToSvg({
        elements: elements as Parameters<typeof exportToSvg>[0]["elements"],
        appState: {
          ...(scene.appState as Record<string, unknown>),
          exportBackground: true,
          exportWithDarkMode: false,
          viewBackgroundColor:
            (scene.appState?.viewBackgroundColor as string) || "#ffffff",
        } as Parameters<typeof exportToSvg>[0]["appState"],
        files: (scene.files || null) as Parameters<typeof exportToSvg>[0]["files"],
        exportPadding: 16,
      });
      const serialized = new XMLSerializer().serializeToString(svgEl);
      const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
      saveAs(blob, `${safeFilename(title)}.svg`);
    } catch (e) {
      reportError(`匯出 SVG 失敗：${(e as Error).message}`);
    } finally {
      setExporting(null);
    }
  }, [elements, scene.appState, scene.files, title, exporting, reportError]);

  const handleCopyJson = useCallback(async () => {
    setErrorMsg(null);
    try {
      const { serializeAsJSON } = await import("@excalidraw/excalidraw");
      const json = serializeAsJSON(
        elements as Parameters<typeof serializeAsJSON>[0],
        scene.appState as Parameters<typeof serializeAsJSON>[1],
        (scene.files || {}) as Parameters<typeof serializeAsJSON>[2],
        "local"
      );
      await navigator.clipboard.writeText(json);
      flashCopy("json");
    } catch (e) {
      reportError(`複製 JSON 失敗：${(e as Error).message}`);
    }
  }, [elements, scene.appState, scene.files, flashCopy, reportError]);

  const handleCopyMermaid = useCallback(async () => {
    if (!mermaidCode) return;
    setErrorMsg(null);
    try {
      await navigator.clipboard.writeText(mermaidCode);
      flashCopy("mermaid");
    } catch (e) {
      reportError(`複製 Mermaid 失敗：${(e as Error).message}`);
    }
  }, [mermaidCode, flashCopy, reportError]);

  const iconBtnClass =
    "inline-flex items-center justify-center h-7 w-7 rounded-md border bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="mt-2 rounded-lg border bg-card overflow-hidden">
      {/* 標題列 */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/30 border-b text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
          <Pencil className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium text-foreground truncate">{title}</span>
          <span className="text-[10px] opacity-70 shrink-0">（{elements.length} 元素）</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground mr-1">
            <Eye className="h-3 w-3" />
            預覽
          </span>

          <button
            type="button"
            onClick={handleExportPng}
            disabled={!!exporting}
            className={iconBtnClass}
            title="下載 PNG"
            aria-label="下載 PNG"
          >
            {exporting === "png" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={handleExportSvg}
            disabled={!!exporting}
            className={iconBtnClass}
            title="下載 SVG（向量）"
            aria-label="下載 SVG"
          >
            {exporting === "svg" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileCode2 className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={handleCopyJson}
            className={iconBtnClass}
            title="複製 .excalidraw JSON 到剪貼簿（可貼回 excalidraw.com 重新打開）"
            aria-label="複製 .excalidraw JSON"
          >
            {copied === "json" ? (
              <ClipboardCheck className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <ClipboardCopy className="h-3.5 w-3.5" />
            )}
          </button>

          {mermaidCode && (
            <button
              type="button"
              onClick={handleCopyMermaid}
              className={iconBtnClass}
              title="複製原始 Mermaid 程式碼到剪貼簿（可貼進 Notion / Obsidian）"
              aria-label="複製 Mermaid 原始碼"
            >
              {copied === "mermaid" ? (
                <ClipboardCheck className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <span className="font-mono text-[10px] font-bold leading-none">M</span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-1 inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent transition-colors"
            title="進入全屏編輯模式"
          >
            <Maximize2 className="h-3 w-3" />
            全屏
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-destructive bg-destructive/5 border-b border-destructive/20">
          <AlertTriangle className="h-3 w-3" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 預覽：唯讀小視窗 */}
      <div style={{ height: previewHeight }} className="w-full">
        <Excalidraw
          initialData={initialData}
          viewModeEnabled
          zenModeEnabled
          UIOptions={{
            canvasActions: {
              changeViewBackgroundColor: false,
              clearCanvas: false,
              export: false,
              loadScene: false,
              saveAsImage: false,
              saveToActiveFile: false,
              toggleTheme: false,
            },
          }}
        />
      </div>

      {/* 全屏編輯 modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-background"
          role="dialog"
          aria-modal="true"
          aria-label={`編輯 Excalidraw：${title}`}
        >
          <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b bg-card">
            <div className="flex items-center gap-2 text-sm">
              <Pencil className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{title}</span>
              <span className="text-[11px] text-muted-foreground">
                — 完整編輯模式（可下載 PNG／SVG／JSON）
              </span>
            </div>
            <button
              type="button"
              onClick={closeEditor}
              className="inline-flex items-center gap-1 rounded-md border bg-background px-3 py-1 text-xs hover:bg-accent transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              關閉
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <Excalidraw initialData={initialData} />
          </div>
        </div>
      )}
    </div>
  );
}
