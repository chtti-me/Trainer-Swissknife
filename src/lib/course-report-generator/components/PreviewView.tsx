"use client";

/**
 * 【課程規劃報告產生器 - 預覽視圖】
 *
 * 設計目的：
 *   讓使用者點「預覽」按鈕後，看到一份「拿掉所有編輯介面、按目前模板/配色實際呈現」
 *   的報告——和最終匯出的 PDF / 圖檔長一模一樣，但不需要真的下載。
 *
 * 兩種模式：
 *   - form 模式：直接套 FormView readOnly={true}。模板的 renderForm 會根據 readOnly
 *     輸出純呈現版（沒有 input、沒有 textarea、沒有「新增」按鈕）。
 *   - canvas 模式：複用 Canvas 的版面定位邏輯，但不掛 BlockFrame 也不掛 contentEditable。
 *     只有純定位的 div + 內容渲染。所有 block 都不可選、不可拖、不可編輯。
 *
 * 與直接 reuse Canvas readOnly=true 的差異：
 *   Canvas readOnly 只關掉「貼上 → 新增」這個快捷鍵，但 BlockFrame 與 contentEditable
 *   仍會吃 selectedBlockId 變動。若直接拿 Canvas 來預覽，預覽中的 hover / click 會
 *   把使用者背景的編輯狀態打亂。所以這裡走獨立路徑，0 副作用。
 *
 * 縮放：
 *   外層用 ResizeObserver 拿到容器寬度，把 stage 的 1024（form）/ 1280（canvas）
 *   等比縮成符合 dialog 寬度。實際 layout box 也同步縮，不會把 dialog 撐爆。
 */
import * as React from "react";
import { useReportStore } from "../store/reportStore";
import { getTemplate } from "../lib/templates";
import { getPalette } from "../lib/palettes";
import { TableBlockView } from "./editor/TableBlockView";
import { ChartBlockView } from "./editor/ChartBlockView";
import { ImageBlockView } from "./editor/ImageBlockView";
import { CenteredTextBlock } from "./ExportRenderer";
import type { CanvasBlock } from "../types/report";

// 讓 stage 寬度一致——要對齊編輯模式時的 STAGE_W = 1280（Canvas）/ 1024（Form）
const FORM_STAGE_W = 1024;
const CANVAS_STAGE_W = 1280;
const CANVAS_STAGE_H = 1700;

export function PreviewView() {
  const report = useReportStore((s) => s.report);
  const template = React.useMemo(() => getTemplate(report.templateId), [report.templateId]);
  const palette = React.useMemo(() => getPalette(report.paletteId), [report.paletteId]);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const baseStageW = report.mode === "canvas" ? CANVAS_STAGE_W : FORM_STAGE_W;
  const [scale, setScale] = React.useState(0.6);

  // 自動 fit-width，與 Canvas 同套邏輯
  React.useLayoutEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => {
      const w = el.clientWidth - 24;
      const next = Math.min(1, Math.max(0.2, w / baseStageW));
      setScale(next);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [baseStageW]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full min-w-0 overflow-auto bg-muted/30 p-3"
    >
      {report.mode === "form" ? (
        <FormPreview scale={scale} />
      ) : (
        <CanvasPreview blocks={report.canvas} scale={scale} paperColor={palette.paper} />
      )}

      {/* 用空 span 防 tree-shaking 把模板（renderForm 是函式內 useMemo 解析）誤刪 */}
      <span className="hidden">{template.id}</span>
    </div>
  );
}

/**
 * Form 模式的預覽：直接搭 FormView 的 readOnly 版本，但這裡為了不依賴 ref，
 * 自己渲染一份完整 stage。
 */
function FormPreview({ scale }: { scale: number }) {
  const report = useReportStore((s) => s.report);
  const template = React.useMemo(() => getTemplate(report.templateId), [report.templateId]);
  const palette = React.useMemo(() => getPalette(report.paletteId), [report.paletteId]);

  return (
    <div
      style={{
        width: FORM_STAGE_W * scale,
        margin: "0 auto",
        // 用 wrapper 撐住 layout box，讓 transform: scale 視覺縮放但不影響高度
        // ↓↓↓ 內層先放 1024 寬的真實 stage，外層 wrapper 寬已等於 1024*scale
      }}
    >
      <div
        style={{
          width: FORM_STAGE_W,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          backgroundColor: palette.paper,
          color: palette.ink,
          colorScheme: "light",
        }}
        className="course-report-stage shadow-lg"
      >
        {template.renderForm({ report, palette, readOnly: true })}
      </div>
    </div>
  );
}

/**
 * Canvas 模式的預覽：純粹按座標定位渲染所有 block，
 * 不掛 BlockFrame（不會有 drag/resize 握把）、不掛 contentEditable。
 */
function CanvasPreview({
  blocks,
  scale,
  paperColor,
}: {
  blocks: CanvasBlock[];
  scale: number;
  paperColor: string;
}) {
  return (
    <div
      style={{
        width: CANVAS_STAGE_W * scale,
        height: CANVAS_STAGE_H * scale,
        margin: "0 auto",
        position: "relative",
      }}
    >
      <div
        style={{
          width: CANVAS_STAGE_W,
          height: CANVAS_STAGE_H,
          backgroundColor: paperColor,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          position: "relative",
        }}
        className="course-report-canvas-stage shadow-xl"
      >
        {blocks.map((b) => (
          <div
            key={b.id}
            style={{
              position: "absolute",
              left: b.x,
              top: b.y,
              width: b.w,
              height: b.h,
              overflow: "hidden",
            }}
          >
            {/*
              直接 reuse ExportRenderer 的 CenteredTextBlock，確保「預覽 = 匯出」
              是同一份 React 元件——任何視覺微調只需要改一個地方。
            */}
            {b.kind === "text" && <CenteredTextBlock block={b} />}
            {b.kind === "image" && <ImageBlockView block={b} selected={false} />}
            {b.kind === "table" && <TableBlockView block={b} selected={false} />}
            {b.kind === "chart" && <ChartBlockView block={b} selected={false} />}
          </div>
        ))}

        {blocks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-muted-foreground">
            目前畫布是空的，請回到編輯區先放一些內容再預覽。
          </div>
        )}
      </div>
    </div>
  );
}

// 註：TextBlock 的渲染（含上下置中）已抽到 ExportRenderer.CenteredTextBlock，
// PreviewView 直接 import 使用即可，這裡不再需要本地的 textStyleToCss。
