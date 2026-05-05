"use client";

/**
 * 【課程規劃報告產生器 - 自由畫布】
 *
 * 1280x720 stage（與業務會報撰寫器一致），等比 fit 進外層容器。
 * 監聽：
 *   - 點擊空白：取消選取
 *   - 貼上：若是 HTML 含 <table> → 自動建立 TableBlock
 *   - 鍵盤：方向鍵微調 / Delete / Ctrl+Z/Y
 */
import * as React from "react";
import { useReportStore, defaultTableStyle, defaultTextStyle } from "../../store/reportStore";
import { useUiStore } from "../../store/uiStore";
import { getPalette } from "../../lib/palettes";
import { newId } from "../../lib/utils";
import type { CanvasBlock } from "../../types/report";
import { BlockFrame } from "./BlockFrame";
import { TextBlockView, parseTableFromHtml } from "./TextBlockView";
import { ImageBlockView } from "./ImageBlockView";
import { TableBlockView } from "./TableBlockView";
import { ChartBlockView } from "./ChartBlockView";
import { useCanvasKeyboard } from "./useDragResize";

const STAGE_W = 1280;
const STAGE_H = 1700; // 較高，讓報告 1 頁能放完，使用者可往下滾

interface Props {
  /** 為 true 時關閉編輯（用於匯出時擷取畫面） */
  readOnly?: boolean;
}

export const Canvas = React.forwardRef<HTMLDivElement, Props>(function Canvas({ readOnly }, ref) {
  const report = useReportStore((s) => s.report);
  const updateBlock = useReportStore((s) => s.updateBlock);
  const removeBlock = useReportStore((s) => s.removeBlock);
  const addBlock = useReportStore((s) => s.addBlock);
  const undo = useReportStore((s) => s.undo);
  const redo = useReportStore((s) => s.redo);
  const selectedBlockId = useUiStore((s) => s.selectedBlockId);
  const setSelectedBlockId = useUiStore((s) => s.setSelectedBlockId);

  const palette = getPalette(report.paletteId);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  // 用一個保守的初值（0.6）避免第一次 paint 時 stage 用 scale=1 撐到 1280
  // 把上層版面撐爆，造成右側 toolbar 被截斷。
  const [scale, setScale] = React.useState(0.6);

  // 自動 fit-width：用 useLayoutEffect，在 browser paint 前就把 scale 算好
  React.useLayoutEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => {
      // padding (p-5 = 20px each side) + 留 4px 不踩 scrollbar
      const w = el.clientWidth - 44;
      const next = Math.min(1, Math.max(0.2, w / STAGE_W));
      setScale(next);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 貼上：在 stage 上方按 Ctrl+V 貼進來；如果有 HTML 表格 → 新增 TableBlock
  React.useEffect(() => {
    if (readOnly) return;
    const handler = (e: ClipboardEvent) => {
      // 若 focus 在某個 contentEditable 內，讓該元素自己處理（已在 TextBlockView 處理）
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.isContentEditable || active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
        return;
      }
      if (!stageRef.current?.contains(e.target as Node) && document.activeElement !== document.body) {
        // 只在 canvas 區或 body 才處理
        if (!stageRef.current?.contains(active as Node)) return;
      }
      const html = e.clipboardData?.getData("text/html");
      if (html && /<table/i.test(html)) {
        const rows = parseTableFromHtml(html);
        if (rows.length > 0) {
          e.preventDefault();
          const newBlock: CanvasBlock = {
            kind: "table",
            id: newId(),
            x: 80,
            y: 80,
            w: 800,
            h: Math.max(120, rows.length * 36),
            rows,
            hasHeader: true,
            style: defaultTableStyle,
          };
          addBlock(newBlock);
          setSelectedBlockId(newBlock.id);
          return;
        }
      }
      // 圖片
      const items = e.clipboardData?.items;
      if (items) {
        for (const it of Array.from(items)) {
          if (it.type.startsWith("image/")) {
            const file = it.getAsFile();
            if (!file) continue;
            const reader = new FileReader();
            reader.onload = () => {
              const newBlock: CanvasBlock = {
                kind: "image",
                id: newId(),
                x: 80,
                y: 80,
                w: 480,
                h: 320,
                src: String(reader.result || ""),
                alt: "貼上的圖片",
                borderRadius: 8,
              };
              addBlock(newBlock);
              setSelectedBlockId(newBlock.id);
            };
            reader.readAsDataURL(file);
            e.preventDefault();
            return;
          }
        }
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [readOnly, addBlock, setSelectedBlockId]);

  // 鍵盤
  useCanvasKeyboard(selectedBlockId, {
    onMove: (dx, dy) => {
      if (!selectedBlockId) return;
      const b = report.canvas.find((x) => x.id === selectedBlockId);
      if (!b) return;
      updateBlock(b.id, { x: b.x + dx, y: b.y + dy } as Partial<CanvasBlock>);
    },
    onDelete: () => {
      if (selectedBlockId) {
        removeBlock(selectedBlockId);
        setSelectedBlockId(null);
      }
    },
    onUndo: undo,
    onRedo: redo,
  });

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full min-w-0 overflow-auto bg-muted/40"
    >
      <div
        style={{
          // 必須用 scale 後的尺寸做 layout box，否則 1280×1700 會撐爆父容器，
          // 把 AppShell toolbar 跟整個版面拉寬到視窗外。
          width: STAGE_W * scale + 40,
          height: STAGE_H * scale + 40,
          padding: 20,
          margin: "0 auto",
          // 預防：就算 scale 沒算好，這裡也不會超出父容器寬度
          maxWidth: "100%",
          boxSizing: "border-box",
        }}
      >
        <div
          ref={(node) => {
            stageRef.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
          }}
          data-export-root="course-report-canvas"
          className="course-report-canvas-stage shadow-xl"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedBlockId(null);
          }}
          style={{
            position: "relative",
            width: STAGE_W,
            height: STAGE_H,
            backgroundColor: palette.paper,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {report.canvas.map((b) => (
            <BlockFrame
              key={b.id}
              block={b}
              scale={scale}
              selected={selectedBlockId === b.id}
              onSelect={() => setSelectedBlockId(b.id)}
            >
              {b.kind === "text" && (
                <TextBlockView
                  block={b}
                  selected={selectedBlockId === b.id}
                  onPasteTable={(rows) => {
                    const tableBlock: CanvasBlock = {
                      kind: "table",
                      id: newId(),
                      x: b.x + 20,
                      y: b.y + b.h + 20,
                      w: 800,
                      h: Math.max(120, rows.length * 36),
                      rows,
                      hasHeader: true,
                      style: defaultTableStyle,
                    };
                    addBlock(tableBlock);
                    setSelectedBlockId(tableBlock.id);
                  }}
                />
              )}
              {b.kind === "image" && <ImageBlockView block={b} selected={selectedBlockId === b.id} />}
              {/* scale 傳下去，TableBlockView 才能精準把滑鼠 movement 換算成欄寬 */}
              {b.kind === "table" && (
                <TableBlockView block={b} selected={selectedBlockId === b.id} scale={scale} />
              )}
              {b.kind === "chart" && <ChartBlockView block={b} selected={selectedBlockId === b.id} />}
            </BlockFrame>
          ))}

          {report.canvas.length === 0 && (
            <div
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center text-muted-foreground"
              style={{ color: palette.ink, opacity: 0.4 }}
            >
              <p className="text-2xl font-semibold">畫布是空的</p>
              <p className="mt-2 text-sm">
                點上方工具列的「插入」可新增文字 / 圖片 / 表格 / 圖表，<br />
                或在「制式表單模式」填好內容後切換到此模式自動產生版型
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 不被使用者拿來貼上工具：依賴 defaultTextStyle 載入時就載入 */}
      <span className="hidden">
        {/* keep-import: defaultTextStyle */}
        {String(Object.keys(defaultTextStyle).length)}
      </span>
    </div>
  );
});
