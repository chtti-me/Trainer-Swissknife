"use client";

/**
 * 【自由畫布 - 表格 Block 渲染】
 *
 * - 支援 cell 內 contentEditable 編輯（block 為 selected 時生效）。
 * - 支援用滑鼠拖曳「欄與欄之間的分隔線」調整欄寬，所有更動寫回 block.colWidths。
 *
 * 欄寬資料模型：
 *   block.colWidths?: number[]   單位＝畫布像素（與 block.w / x / y 同座標系）
 *   - undefined 或長度與欄數不符時，視為「平均分配」，不需要立即寫死。
 *   - 拖第一次調整時，才把目前的「目視寬度」固化進 block.colWidths。
 *
 * 與 Canvas 的整合：
 *   Canvas 的外層 stage 用 CSS transform: scale 縮放，所以滑鼠 movement
 *   要除以 scale 才能換算成畫布像素 → 透過 prop 傳進來。
 *   未提供 scale（preview 模式）時，handle 不顯示、不可拖。
 */
import * as React from "react";
import type { CanvasBlock } from "../../types/report";
import { useReportStore } from "../../store/reportStore";

interface Props {
  block: Extract<CanvasBlock, { kind: "table" }>;
  selected: boolean;
  /** 畫布縮放倍率；省略時不啟用欄寬拖曳功能（給 PreviewView 用） */
  scale?: number;
}

/** 欄寬最小值（畫布座標像素），避免被拖到 0 */
const MIN_COL_W = 30;

export function TableBlockView({ block, selected, scale }: Props) {
  const updateBlock = useReportStore((s) => s.updateBlock);
  const tableRef = React.useRef<HTMLTableElement>(null);

  const colCount = block.rows[0]?.length ?? 0;

  // 拿到「實際使用的欄寬」陣列：若 colWidths 缺失或長度不符，回傳 undefined
  // 表示走「auto」分配（CSS table-layout 預設）
  const effectiveColWidths: number[] | null = React.useMemo(() => {
    if (
      Array.isArray(block.colWidths) &&
      block.colWidths.length === colCount &&
      block.colWidths.every((n) => typeof n === "number" && n > 0)
    ) {
      return [...block.colWidths];
    }
    return null;
  }, [block.colWidths, colCount]);

  const onCellChange = (r: number, c: number, val: string) => {
    const rows = block.rows.map((row) => [...row]);
    if (!rows[r]) rows[r] = [];
    rows[r][c] = val;
    updateBlock(block.id, { rows } as Partial<CanvasBlock>);
  };

  /**
   * 拖曳分隔線：
   *   - 把「正在拖的欄」與「右邊鄰欄」當成一組，
   *     拖右就把當前欄變寬、右鄰縮窄；拖左反之。
   *   - 兩欄總寬度保持不變（不會把整個表格撐爆）。
   *   - 為了在第一次拖曳時就有明確基準，會先依當下 DOM 計算出每欄的「目視寬度」
   *     寫進 store，之後拖曳都針對那組數字做加減。
   */
  const startResize = React.useCallback(
    (colIndex: number, e: React.PointerEvent) => {
      // 沒 scale 表示是預覽模式，不啟動拖曳
      if (!scale || colIndex >= colCount - 1) return;
      e.preventDefault();
      e.stopPropagation();

      // 取得當下每欄的 DOM 寬度作為起始值
      const tbl = tableRef.current;
      if (!tbl) return;
      const headerCells = Array.from(tbl.querySelectorAll<HTMLTableCellElement>(":scope > tbody > tr:first-child > td"));
      const measured = headerCells.map((td) => td.getBoundingClientRect().width / Math.max(0.1, scale));
      const widths = effectiveColWidths ?? measured;
      if (widths.length !== colCount) return;

      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const origLeft = widths[colIndex];
      const origRight = widths[colIndex + 1];

      const onMove = (ev: PointerEvent) => {
        const dxLogical = (ev.clientX - startX) / Math.max(0.1, scale);
        let nextLeft = origLeft + dxLogical;
        let nextRight = origRight - dxLogical;
        // 雙邊都要 >= MIN_COL_W
        if (nextLeft < MIN_COL_W) {
          const overflow = MIN_COL_W - nextLeft;
          nextLeft = MIN_COL_W;
          nextRight -= overflow;
        }
        if (nextRight < MIN_COL_W) {
          const overflow = MIN_COL_W - nextRight;
          nextRight = MIN_COL_W;
          nextLeft -= overflow;
        }
        const next = [...widths];
        next[colIndex] = nextLeft;
        next[colIndex + 1] = nextRight;
        updateBlock(block.id, { colWidths: next } as Partial<CanvasBlock>);
      };

      const onUp = (ev: PointerEvent) => {
        try {
          target.releasePointerCapture(ev.pointerId);
        } catch {
          // ignore
        }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [block.id, colCount, effectiveColWidths, scale, updateBlock]
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "auto",
        backgroundColor: block.style.cellBg,
      }}
    >
      <table
        ref={tableRef}
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: block.style.fontSize,
          fontFamily: block.style.fontFamily,
          // 有寫死欄寬時改用 fixed layout，瀏覽器才會精確套用 col width
          tableLayout: effectiveColWidths ? "fixed" : "auto",
        }}
      >
        {effectiveColWidths && (
          <colgroup>
            {effectiveColWidths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
        )}
        <tbody>
          {block.rows.map((row, ri) => {
            const isHeader = block.hasHeader && ri === 0;
            const bg = isHeader ? block.style.headerBg : block.style.cellBg;
            const fg = isHeader ? block.style.headerColor : block.style.cellColor;
            return (
              <tr key={ri}>
                {row.map((cell, ci) => {
                  const showHandle = selected && !!scale && ci < colCount - 1;
                  return (
                    <td
                      key={ci}
                      style={{
                        position: "relative", // 給 resize handle 定位用
                        border: `${block.style.borderWidth}px solid ${block.style.borderColor}`,
                        padding: 6,
                        backgroundColor: bg,
                        color: fg,
                        fontWeight: isHeader ? 700 : 400,
                        // 表頭 cell：垂直置中（視覺最舒服，與 form 模式 SessionsTable 看齊）；
                        // 資料 cell：維持靠上（亮點欄位常需多行，靠上比較好讀）
                        verticalAlign: isHeader ? "middle" : "top",
                        // 表頭 cell 文字置中；資料 cell 維持 left（資料量大時讀起來比較順）
                        textAlign: isHeader ? "center" : "left",
                        // 用 fixed layout 時，加 word-break 讓內容過長時換行而非撐爆欄寬
                        wordBreak: effectiveColWidths ? "break-word" : undefined,
                      }}
                    >
                      <div
                        contentEditable={selected}
                        suppressContentEditableWarning
                        onBlur={(e) => {
                          const v = e.currentTarget.innerText;
                          if (v !== cell) onCellChange(ri, ci, v);
                        }}
                        onMouseDown={(e) => {
                          if (selected) e.stopPropagation();
                        }}
                        // 表頭 cell 內 div 也置中，避免 contentEditable 對齊跑掉
                        style={{
                          outline: "none",
                          minHeight: 14,
                          whiteSpace: "pre-wrap",
                          textAlign: isHeader ? "center" : "left",
                        }}
                      >
                        {cell}
                      </div>
                      {showHandle && (
                        <ColResizeHandle
                          onPointerDown={(e) => startResize(ci, e)}
                          accentColor={block.style.borderColor || "#3b82f6"}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 欄寬拖曳手柄：
 *   絕對定位在 cell 右邊界，寬度 6px、高度滿格，cursor=col-resize。
 *   平常半透明、hover/active 才實心，避免遮擋使用者輸入文字。
 */
function ColResizeHandle({
  onPointerDown,
  accentColor,
}: {
  onPointerDown: (e: React.PointerEvent) => void;
  accentColor: string;
}) {
  const [active, setActive] = React.useState(false);
  return (
    <div
      onPointerDown={(e) => {
        setActive(true);
        onPointerDown(e);
      }}
      onPointerUp={() => setActive(false)}
      onPointerCancel={() => setActive(false)}
      title="拖曳調整欄寬"
      style={{
        position: "absolute",
        top: 0,
        right: -3,
        width: 6,
        height: "100%",
        cursor: "col-resize",
        zIndex: 10,
        // hover / active 時用 accent 色淡淡浮現一條
        backgroundColor: active ? accentColor : "transparent",
        opacity: active ? 0.6 : 0.001, // 0.001 確保仍可接收 pointer 事件
        transition: "background-color 120ms, opacity 120ms",
        userSelect: "none",
        touchAction: "none",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = accentColor;
        e.currentTarget.style.opacity = "0.4";
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.opacity = "0.001";
        }
      }}
    />
  );
}
