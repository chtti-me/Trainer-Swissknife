"use client";

/**
 * 【TextBlock 渲染】
 *
 * 使用 contentEditable，支援即時編輯、右鍵 AI 選單、貼上 HTML（包含表格）。
 */
import * as React from "react";
import type { CanvasBlock } from "../../types/report";
import { useReportStore } from "../../store/reportStore";
import { useUiStore } from "../../store/uiStore";

interface Props {
  block: Extract<CanvasBlock, { kind: "text" }>;
  selected: boolean;
  onPasteTable?: (rows: string[][]) => void;
}

export function TextBlockView({ block, selected, onPasteTable }: Props) {
  const updateBlock = useReportStore((s) => s.updateBlock);
  const openContextMenu = useUiStore((s) => s.openContextMenu);
  const ref = React.useRef<HTMLDivElement>(null);

  // 把 store 中的 html 寫進 DOM；只在外部變更時同步，否則會干擾游標
  React.useEffect(() => {
    if (!ref.current) return;
    if (ref.current.innerHTML !== block.html) {
      ref.current.innerHTML = block.html;
    }
  }, [block.html]);

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const html = e.clipboardData.getData("text/html");
    if (html && /<table/i.test(html) && onPasteTable) {
      e.preventDefault();
      const rows = parseTableFromHtml(html);
      if (rows.length > 0) {
        onPasteTable(rows);
        return;
      }
    }
    // 否則：把 plain text 插入（不要原始 HTML 樣式干擾）
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const sel = window.getSelection();
    const text = sel?.toString().trim() || ref.current?.innerText.trim() || "";
    openContextMenu(e.clientX, e.clientY, {
      kind: "text",
      selectionText: text,
      blockId: block.id,
    });
    // 紀錄 contentEditable 元素，讓 ContextMenu 在執行 optimize-text 時可替換選取
    (window as unknown as { __courseReportLastEditable?: HTMLElement }).__courseReportLastEditable = ref.current ?? undefined;
    (window as unknown as { __courseReportLastEditableBlockId?: string }).__courseReportLastEditableBlockId = block.id;
  };

  const handleBlur = () => {
    if (ref.current) {
      const html = ref.current.innerHTML;
      if (html !== block.html) {
        updateBlock(block.id, { html } as Partial<CanvasBlock>);
      }
    }
  };

  return (
    <div
      ref={ref}
      contentEditable={selected}
      suppressContentEditableWarning
      onBlur={handleBlur}
      onPaste={handlePaste}
      onContextMenu={handleContextMenu}
      onMouseDown={(e) => {
        // 在 contentEditable 內 mousedown 不冒泡到 BlockFrame，避免 select 觸發 drag
        if (selected) e.stopPropagation();
      }}
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        outline: "none",
        cursor: selected ? "text" : "pointer",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        ...textStyleToCss(block.style),
      }}
    />
  );
}

function textStyleToCss(s: Extract<CanvasBlock, { kind: "text" }>["style"]): React.CSSProperties {
  return {
    fontFamily: s.fontFamily,
    fontSize: s.fontSize,
    fontWeight: s.fontWeight as React.CSSProperties["fontWeight"],
    fontStyle: s.fontStyle,
    textDecoration: s.textDecoration,
    color: s.color,
    backgroundColor: s.backgroundColor,
    textAlign: s.textAlign as React.CSSProperties["textAlign"],
    lineHeight: s.lineHeight,
    padding: s.padding,
    borderWidth: s.borderWidth,
    borderColor: s.borderColor,
    borderStyle: s.borderWidth ? "solid" : undefined,
    borderRadius: s.borderRadius,
  };
}

/** 從 HTML 中抽出第一個 <table> 的 rows */
export function parseTableFromHtml(html: string): string[][] {
  if (typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return [];
  const rows: string[][] = [];
  table.querySelectorAll("tr").forEach((tr) => {
    const cells: string[] = [];
    tr.querySelectorAll("th, td").forEach((td) => {
      cells.push((td as HTMLElement).innerText.trim());
    });
    if (cells.length > 0) rows.push(cells);
  });
  return rows;
}
