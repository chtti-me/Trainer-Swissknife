"use client";

/**
 * 【AI 右鍵選單】
 *
 * 顯示在 useUiStore.contextMenu.open === true 時。
 * 4 項操作：
 *   - 優化文字內容
 *   - 挖掘或發想亮點
 *   - 依據文字生成配圖
 *   - 依據文字生成資料圖表（先檢測是否有數據）
 *
 * 處理對象：
 *   - canvas TextBlock：用 contextmenu payload 中的 blockId
 *   - 制式表單的 textarea：透過 window.__courseReportLastTextarea / Setter 替換
 */
import * as React from "react";
import { useUiStore } from "../../store/uiStore";
import { useReportStore, defaultTextStyle } from "../../store/reportStore";
import { useToast } from "@/components/ui/toaster";
import {
  aiOptimizeText,
  aiFindHighlights,
  aiGenerateImage,
  aiGenerateChart,
} from "../../lib/client/api";
import { newId } from "../../lib/utils";
import type { CanvasBlock } from "../../types/report";
import { Loader2, Sparkles, Lightbulb, ImageIcon, BarChart3 } from "lucide-react";

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  hint?: string;
  onClick: () => Promise<void> | void;
}

export function AiContextMenu() {
  const cm = useUiStore((s) => s.contextMenu);
  const closeContextMenu = useUiStore((s) => s.closeContextMenu);
  const setSelectedBlockId = useUiStore((s) => s.setSelectedBlockId);
  const report = useReportStore((s) => s.report);
  const updateBlock = useReportStore((s) => s.updateBlock);
  const addBlock = useReportStore((s) => s.addBlock);
  const setBenefits = useReportStore((s) => s.setBenefits);
  const { toast } = useToast();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);

  // 點擊外部關閉
  React.useEffect(() => {
    if (!cm.open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeContextMenu();
    };
    setTimeout(() => {
      document.addEventListener("mousedown", onClick);
      document.addEventListener("keydown", onKey);
    }, 50);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [cm.open, closeContextMenu]);

  if (!cm.open || cm.payload?.kind !== "text") return null;
  const text = cm.payload.selectionText.trim();
  if (!text) return null;

  const reportSnapshot = {
    title: report.title || undefined,
    reporter: report.reporter || undefined,
    department: report.department || undefined,
    purpose: report.purpose || undefined,
  };

  // 取代當前選取（canvas TextBlock 或 textarea）
  const replaceText = (newText: string) => {
    // 1) canvas TextBlock 模式
    const blockId = cm.payload?.kind === "text" ? cm.payload.blockId : null;
    if (blockId) {
      const editable = (window as unknown as { __courseReportLastEditable?: HTMLElement }).__courseReportLastEditable;
      if (editable && editable.dataset && (editable.parentElement?.dataset?.blockId === blockId || true)) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && sel.toString().length > 0) {
          // 替換選取部分
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(newText));
          sel.removeAllRanges();
        } else {
          // 替換整個 block
          editable.innerText = newText;
        }
        // 同步到 store
        const block = report.canvas.find((b) => b.id === blockId);
        if (block && block.kind === "text") {
          updateBlock(blockId, { html: editable.innerHTML } as Partial<CanvasBlock>);
        }
        return true;
      }
    }
    // 2) 制式表單 textarea 模式
    const ta = (window as unknown as { __courseReportLastTextarea?: HTMLTextAreaElement }).__courseReportLastTextarea;
    const setter = (window as unknown as { __courseReportLastTextareaSetter?: (v: string) => void }).__courseReportLastTextareaSetter;
    if (ta && setter) {
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      if (start !== end) {
        const next = ta.value.slice(0, start) + newText + ta.value.slice(end);
        setter(next);
      } else {
        setter(newText);
      }
      return true;
    }
    return false;
  };

  // 在當前選取下方插入新 block（用於亮點 / 圖片 / 圖表）
  const insertNewBlock = (block: CanvasBlock) => {
    addBlock(block);
    setSelectedBlockId(block.id);
  };

  const items: MenuItem[] = [
    {
      id: "optimize",
      label: "優化文字內容",
      icon: <Sparkles className="h-4 w-4" />,
      hint: "讓 AI 重寫此段為更專業、精煉的中文",
      onClick: async () => {
        try {
          setBusyId("optimize");
          const result = await aiOptimizeText(text, reportSnapshot, undefined, "formal");
          const ok = replaceText(result);
          if (!ok) {
            toast("已取得優化版本，但無法自動套用，請手動複製", "info");
            await navigator.clipboard.writeText(result);
          } else {
            toast("已套用優化後的文字", "success");
          }
          closeContextMenu();
        } catch (err) {
          toast(`優化失敗：${err instanceof Error ? err.message : "未知錯誤"}`, "error");
        } finally {
          setBusyId(null);
        }
      },
    },
    {
      id: "highlights",
      label: "挖掘或發想亮點",
      icon: <Lightbulb className="h-4 w-4" />,
      hint: "從段落 + 報告脈絡發掘 3–5 個潛在亮點",
      onClick: async () => {
        try {
          setBusyId("highlights");
          const list = await aiFindHighlights(text, reportSnapshot);
          // 把亮點插入「效益」區塊（合併現有清單）
          const merged = [...report.benefits.filter((b) => b && b.trim()), ...list];
          setBenefits(merged);
          // 同時插入畫布：文字 block 列出新亮點
          if (report.mode === "canvas") {
            const block: CanvasBlock = {
              kind: "text",
              id: newId(),
              x: 100,
              y: 100,
              w: 720,
              h: Math.max(160, list.length * 32 + 40),
              html:
                "<strong>✨ AI 發掘亮點</strong><ul style='margin-top:8px;padding-left:20px;'>" +
                list.map((s) => `<li style='margin-bottom:6px;'>${escapeHtml(s)}</li>`).join("") +
                "</ul>",
              style: { ...defaultTextStyle, fontSize: 14 },
            };
            insertNewBlock(block);
          }
          toast(`AI 發掘 ${list.length} 個亮點，已加入「效益」清單${report.mode === "canvas" ? " 並插入畫布" : ""}`, "success");
          closeContextMenu();
        } catch (err) {
          toast(`亮點發掘失敗：${err instanceof Error ? err.message : "未知錯誤"}`, "error");
        } finally {
          setBusyId(null);
        }
      },
    },
    {
      id: "image",
      label: "依據文字生成配圖",
      icon: <ImageIcon className="h-4 w-4" />,
      hint: "用 Gemini 影像產生符合此段內容的插圖",
      onClick: async () => {
        try {
          setBusyId("image");
          const r = await aiGenerateImage(text, { ratio: "16:9" });
          // 插入畫布作為 ImageBlock
          const block: CanvasBlock = {
            kind: "image",
            id: newId(),
            x: 100,
            y: 100,
            w: 640,
            h: 360,
            src: r.dataUrl,
            alt: `AI 生成：${text.slice(0, 40)}`,
            borderRadius: 8,
          };
          insertNewBlock(block);
          toast("已生成配圖並插入畫布", "success");
          closeContextMenu();
        } catch (err) {
          toast(`生圖失敗：${err instanceof Error ? err.message : "未知錯誤"}`, "error");
        } finally {
          setBusyId(null);
        }
      },
    },
    {
      id: "chart",
      label: "依據文字生成資料圖表",
      icon: <BarChart3 className="h-4 w-4" />,
      hint: "AI 偵測選取段落是否有可量化資料；有則生成圖表",
      onClick: async () => {
        try {
          setBusyId("chart");
          const r = await aiGenerateChart(text);
          if (!r.ok) {
            toast(r.reason || "選取段落缺少數據元素，無法生成圖表", "error");
            closeContextMenu();
            return;
          }
          if (!r.spec) {
            toast("AI 未回傳圖表資料", "error");
            return;
          }
          const block: CanvasBlock = {
            kind: "chart",
            id: newId(),
            x: 100,
            y: 100,
            w: 640,
            h: 360,
            spec: r.spec,
          };
          insertNewBlock(block);
          toast(`已生成 ${r.spec.type} 圖表並插入畫布`, "success");
          closeContextMenu();
        } catch (err) {
          toast(`圖表生成失敗：${err instanceof Error ? err.message : "未知錯誤"}`, "error");
        } finally {
          setBusyId(null);
        }
      },
    },
  ];

  // 適度避免選單超出視窗
  const w = 280;
  const itemH = 56;
  const winH = typeof window !== "undefined" ? window.innerHeight : 800;
  const winW = typeof window !== "undefined" ? window.innerWidth : 1200;
  const left = Math.min(cm.x, winW - w - 12);
  const top = Math.min(cm.y, winH - itemH * items.length - 60);

  return (
    <div
      ref={ref}
      style={{ position: "fixed", left, top, width: w, zIndex: 9999 }}
      className="overflow-hidden rounded-md border bg-popover shadow-lg"
      role="menu"
    >
      <div className="border-b bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        AI 輔助 — 對選取「{text.slice(0, 24)}{text.length > 24 ? "…" : ""}」
      </div>
      <ul className="py-1">
        {items.map((it) => (
          <li key={it.id}>
            <button
              disabled={busyId !== null}
              onClick={() => void it.onClick()}
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
            >
              <span className="mt-0.5 shrink-0">
                {busyId === it.id ? <Loader2 className="h-4 w-4 animate-spin" /> : it.icon}
              </span>
              <span className="flex-1">
                <span className="block font-medium">{it.label}</span>
                {it.hint && <span className="block text-[11px] text-muted-foreground">{it.hint}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
