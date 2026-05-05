"use client";

/**
 * 【Block 邊框 + 拖曳/縮放握把】
 *
 * 包覆每個 CanvasBlock，在選中時顯示 8 個調整握把，邊框可拖曳。
 */
import * as React from "react";
import { useDrag, useResize } from "./useDragResize";
import { useReportStore } from "../../store/reportStore";
import type { CanvasBlock } from "../../types/report";

interface Props {
  block: CanvasBlock;
  scale: number;
  selected: boolean;
  children: React.ReactNode;
  onSelect: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const HANDLE_SIZE = 10;

export function BlockFrame({ block, scale, selected, children, onSelect, onContextMenu }: Props) {
  const updateBlock = useReportStore((s) => s.updateBlock);

  // 拖曳：邊框（非握把）按下時觸發
  const dragHandlers = useDrag({
    x: block.x,
    y: block.y,
    scale,
    onDrag: (nx, ny) => updateBlock(block.id, { x: nx, y: ny } as Partial<CanvasBlock>),
  });

  return (
    <div
      data-block-id={block.id}
      onMouseDown={(e) => {
        // 滑鼠按下時就選中（不要等 click，否則 dnd 體驗差）
        e.stopPropagation();
        onSelect();
      }}
      onContextMenu={onContextMenu}
      style={{
        position: "absolute",
        left: block.x,
        top: block.y,
        width: block.w,
        height: block.h,
        outline: selected ? "2px solid #3b82f6" : "1px dashed transparent",
        outlineOffset: 0,
      }}
      className="course-report-block group"
    >
      {/* 拖曳手柄：選中時顯示在 top 中間（避免與內容互動衝突） */}
      {selected && (
        <div
          {...dragHandlers}
          title="拖曳移動"
          style={{
            position: "absolute",
            top: -22,
            left: 0,
            height: 18,
            paddingLeft: 6,
            paddingRight: 6,
            backgroundColor: "#3b82f6",
            color: "#fff",
            fontSize: 11,
            borderRadius: 4,
            cursor: "grab",
            userSelect: "none",
          }}
        >
          ⠿ 拖曳
        </div>
      )}
      {children}
      {selected && (
        <>
          <ResizeHandle pos="nw" block={block} scale={scale} />
          <ResizeHandle pos="n" block={block} scale={scale} />
          <ResizeHandle pos="ne" block={block} scale={scale} />
          <ResizeHandle pos="w" block={block} scale={scale} />
          <ResizeHandle pos="e" block={block} scale={scale} />
          <ResizeHandle pos="sw" block={block} scale={scale} />
          <ResizeHandle pos="s" block={block} scale={scale} />
          <ResizeHandle pos="se" block={block} scale={scale} />
        </>
      )}
    </div>
  );
}

function ResizeHandle({
  pos,
  block,
  scale,
}: {
  pos: "se" | "sw" | "ne" | "nw" | "e" | "w" | "n" | "s";
  block: CanvasBlock;
  scale: number;
}) {
  const updateBlock = useReportStore((s) => s.updateBlock);
  const handlers = useResize({
    x: block.x,
    y: block.y,
    w: block.w,
    h: block.h,
    scale,
    handle: pos,
    onResize: (next) => updateBlock(block.id, next as Partial<CanvasBlock>),
  });

  // 計算位置
  const half = HANDLE_SIZE / 2;
  const style: React.CSSProperties = {
    position: "absolute",
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    backgroundColor: "#3b82f6",
    border: "1px solid #fff",
    borderRadius: 2,
    cursor: pos === "n" || pos === "s" ? "ns-resize" : pos === "e" || pos === "w" ? "ew-resize" : pos === "ne" || pos === "sw" ? "nesw-resize" : "nwse-resize",
    zIndex: 10,
  };
  if (pos.includes("n")) style.top = -half;
  if (pos.includes("s")) style.bottom = -half;
  if (pos.includes("w")) style.left = -half;
  if (pos.includes("e")) style.right = -half;
  if (pos === "n" || pos === "s") {
    style.left = "50%";
    style.marginLeft = -half;
  }
  if (pos === "e" || pos === "w") {
    style.top = "50%";
    style.marginTop = -half;
  }

  return <div {...handlers} style={style} />;
}
