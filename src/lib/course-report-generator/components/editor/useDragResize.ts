"use client";

/**
 * 【課程規劃報告產生器 - 拖曳/縮放 hooks】
 *
 * 用 pointer events 實作。Block 的 x/y/w/h 是「畫布座標」（不縮放，
 * 由外層 .canvas-stage 用 CSS transform: scale 處理 fit）。
 */
import { useCallback, useEffect, useRef } from "react";

interface DragOptions {
  x: number;
  y: number;
  /** 畫布縮放倍率（畫布在外層被 scale 了多少） */
  scale: number;
  onDrag: (nx: number, ny: number) => void;
  onDragEnd?: (nx: number, ny: number) => void;
  enabled?: boolean;
  /** 對齊網格大小（像素） */
  snap?: number;
}

export function useDrag({ x, y, scale, onDrag, onDragEnd, enabled = true, snap = 8 }: DragOptions) {
  const stateRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ pointerId: null, startX: 0, startY: 0, origX: 0, origY: 0 });

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;
      // 不要在 contentEditable 裡按下時就拖曳；先讓 user 點擊；
      // 真正拖曳由「邊框握把」觸發 → 這裡假設外層按到邊框時才呼叫
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      stateRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origX: x,
        origY: y,
      };
    },
    [enabled, x, y]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const s = stateRef.current;
      if (s.pointerId == null) return;
      const dx = (e.clientX - s.startX) / Math.max(0.1, scale);
      const dy = (e.clientY - s.startY) / Math.max(0.1, scale);
      let nx = s.origX + dx;
      let ny = s.origY + dy;
      if (snap > 0) {
        nx = Math.round(nx / snap) * snap;
        ny = Math.round(ny / snap) * snap;
      }
      onDrag(nx, ny);
    },
    [onDrag, scale, snap]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const s = stateRef.current;
      if (s.pointerId == null) return;
      const target = e.currentTarget as HTMLElement;
      try {
        target.releasePointerCapture(s.pointerId);
      } catch {
        // ignore
      }
      const dx = (e.clientX - s.startX) / Math.max(0.1, scale);
      const dy = (e.clientY - s.startY) / Math.max(0.1, scale);
      let nx = s.origX + dx;
      let ny = s.origY + dy;
      if (snap > 0) {
        nx = Math.round(nx / snap) * snap;
        ny = Math.round(ny / snap) * snap;
      }
      stateRef.current.pointerId = null;
      onDragEnd?.(nx, ny);
    },
    [onDragEnd, scale, snap]
  );

  return { onPointerDown, onPointerMove, onPointerUp };
}

interface ResizeOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
  /** 當前正在拖的 handle */
  handle: "se" | "sw" | "ne" | "nw" | "e" | "w" | "n" | "s";
  onResize: (next: { x: number; y: number; w: number; h: number }) => void;
  onResizeEnd?: (next: { x: number; y: number; w: number; h: number }) => void;
  minW?: number;
  minH?: number;
}

export function useResize({
  x,
  y,
  w,
  h,
  scale,
  handle,
  onResize,
  onResizeEnd,
  minW = 60,
  minH = 30,
}: ResizeOptions) {
  const stateRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    orig: { x: number; y: number; w: number; h: number };
  }>({ pointerId: null, startX: 0, startY: 0, orig: { x, y, w, h } });

  const compute = useCallback(
    (e: React.PointerEvent | PointerEvent): { x: number; y: number; w: number; h: number } => {
      const s = stateRef.current;
      const dx = (e.clientX - s.startX) / Math.max(0.1, scale);
      const dy = (e.clientY - s.startY) / Math.max(0.1, scale);
      let nx = s.orig.x;
      let ny = s.orig.y;
      let nw = s.orig.w;
      let nh = s.orig.h;
      if (handle.includes("e")) nw = Math.max(minW, s.orig.w + dx);
      if (handle.includes("w")) {
        nw = Math.max(minW, s.orig.w - dx);
        nx = s.orig.x + (s.orig.w - nw);
      }
      if (handle.includes("s")) nh = Math.max(minH, s.orig.h + dy);
      if (handle.includes("n")) {
        nh = Math.max(minH, s.orig.h - dy);
        ny = s.orig.y + (s.orig.h - nh);
      }
      return { x: nx, y: ny, w: nw, h: nh };
    },
    [handle, minW, minH, scale]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      stateRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        orig: { x, y, w, h },
      };
    },
    [x, y, w, h]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (stateRef.current.pointerId == null) return;
      onResize(compute(e));
    },
    [onResize, compute]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (stateRef.current.pointerId == null) return;
      const target = e.currentTarget as HTMLElement;
      try {
        target.releasePointerCapture(stateRef.current.pointerId);
      } catch {
        // ignore
      }
      const next = compute(e);
      stateRef.current.pointerId = null;
      onResizeEnd?.(next);
    },
    [onResizeEnd, compute]
  );

  return { onPointerDown, onPointerMove, onPointerUp };
}

/**
 * 在 Canvas 容器上監聽鍵盤事件（方向鍵微調、Delete 刪除）。
 */
export function useCanvasKeyboard(
  selectedBlockId: string | null,
  options: {
    onMove: (dx: number, dy: number) => void;
    onDelete: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
  }
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // 在 input/textarea/contentEditable 中時，不攔截
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        tag === "input" ||
        tag === "textarea" ||
        target?.isContentEditable;
      const isMod = e.ctrlKey || e.metaKey;

      // 方向鍵微調：必須有選中的 block，且不是在編輯文字
      if (selectedBlockId && !isEditable) {
        const step = e.shiftKey ? 16 : 4;
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          options.onMove(-step, 0);
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          options.onMove(step, 0);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          options.onMove(0, -step);
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          options.onMove(0, step);
          return;
        }
        if ((e.key === "Delete" || e.key === "Backspace") && !isEditable) {
          e.preventDefault();
          options.onDelete();
          return;
        }
      }

      if (isMod && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
        if (options.onUndo) {
          e.preventDefault();
          options.onUndo();
        }
        return;
      }
      if (isMod && ((e.key === "z" && e.shiftKey) || e.key === "y" || e.key === "Y")) {
        if (options.onRedo) {
          e.preventDefault();
          options.onRedo();
        }
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedBlockId, options]);
}
