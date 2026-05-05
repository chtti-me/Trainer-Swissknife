"use client";

/**
 * 【匯出用 read-only 渲染器】
 *
 * 為什麼需要這個：
 *   先前 PNG / PDF / PPTX(form 截圖) / HTML / DOC(canvas) 都是直接擷取「正在編輯」的
 *   FormView / Canvas DOM。那個 DOM 裡塞滿 native <input> <textarea>，
 *   既不適合截圖（form control 文字下緣會被截掉），也包含 hover / focus ring
 *   等編輯介面元素。使用者點「預覽」看到的版本才是真正乾淨的呈現——
 *   因為 PreviewView 是用模板的 readOnly 模式 + 純定位渲染，沒有任何 form control。
 *
 * 這個元件就是把 PreviewView 那種「乾淨呈現」固定渲染在畫面外（左 -99999px），
 * 永遠待命；按下匯出時，匯出工具直接擷取它，畫面就會跟預覽長得一模一樣。
 *
 * 截圖實作：使用 html-to-image（非 html2canvas）。
 *   html-to-image 把 DOM 包進 SVG <foreignObject> 給瀏覽器 native render，
 *   文字 baseline 與預覽完全一致；不再有 html2canvas 對中文字 baseline
 *   偏下的長期問題。
 *
 * 設計重點：
 *   - 「不縮放」：FormView 用原 1024 寬、Canvas 用原 1280×1700，
 *     在原寬度下擷取最不會出現邊界裁切問題。
 *   - 「不可互動」：pointer-events: none，使用者誤點不到。
 *   - 「永遠掛載」：避免 Dialog 開啟才 mount 導致 DOM 還沒就緒就被擷取。
 *   - 「ref 永遠指向當前 mode 的 root」：上層只需要一支 ref 就能匯出兩種模式。
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { useReportStore } from "../store/reportStore";
import { getTemplate } from "../lib/templates";
import { getPalette } from "../lib/palettes";
import { TableBlockView } from "./editor/TableBlockView";
import { ChartBlockView } from "./editor/ChartBlockView";
import { ImageBlockView } from "./editor/ImageBlockView";
import type { CanvasBlock } from "../types/report";

const FORM_STAGE_W = 1024;
const CANVAS_STAGE_W = 1280;
const CANVAS_STAGE_H = 1700;

/**
 * 用 Portal 把整個 stage 接到 document.body 下，理由：
 *   1. AppShell 是 overflow-hidden + flex 容器；如果 ExportRenderer 直接 mount
 *      在裡面，雖然 absolute 定位仍然有效，但有些瀏覽器在計算 transform / filter
 *      ancestor 時會把 absolute 子元素往內塞，匯出時可能拿到非預期座標。
 *   2. Portal 到 body 後，containing block 永遠是 ICB（initial containing block），
 *      位置完全可預測：只要 left/top 大於畫面就一定看不到。
 *   3. 與使用者編輯區的 React 樹完全分離，不會被某些 CSS reset 影響。
 */
export const ExportRenderer = React.forwardRef<HTMLDivElement>(function ExportRenderer(
  _props,
  ref
) {
  const report = useReportStore((s) => s.report);
  const template = React.useMemo(() => getTemplate(report.templateId), [report.templateId]);
  const palette = React.useMemo(() => getPalette(report.paletteId), [report.paletteId]);

  // SSR 時 document 不存在，需等 mount 完成才能 createPortal
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;

  // ─── 外層：把 stage 推到畫面外 ───
  // 用 fixed + 巨大負偏移；fixed 確保不被任何 transformed 祖先影響。
  // pointer-events:none 讓使用者點擊不到、選不到。
  // visibility 不設 hidden（會讓 html2canvas 抓不到）。
  const outerStyle: React.CSSProperties = {
    position: "fixed",
    left: -99999,
    top: 0,
    pointerEvents: "none",
    zIndex: -1,
  };

  let content: React.ReactNode;

  if (report.mode === "form") {
    content = (
      <div style={outerStyle} aria-hidden="true">
        <div
          ref={ref}
          data-export-root="course-report-form"
          style={{
            width: FORM_STAGE_W,
            backgroundColor: palette.paper,
            color: palette.ink,
            colorScheme: "light",
          }}
          className="course-report-stage"
        >
          {template.renderForm({ report, palette, readOnly: true })}
        </div>
      </div>
    );
  } else {
    // canvas 模式：以原 1280×1700 渲染所有 block，無 BlockFrame、無 contentEditable
    content = (
      <div style={outerStyle} aria-hidden="true">
        <div
          ref={ref}
          data-export-root="course-report-canvas"
          style={{
            width: CANVAS_STAGE_W,
            height: CANVAS_STAGE_H,
            position: "relative",
            backgroundColor: palette.paper,
            color: palette.ink,
            colorScheme: "light",
          }}
          className="course-report-canvas-stage"
        >
          {report.canvas.map((b) => (
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
              {b.kind === "text" && <CenteredTextBlock block={b} />}
              {b.kind === "image" && <ImageBlockView block={b} selected={false} />}
              {/*
                TableBlockView 在 selected=false + 沒有 scale prop 時：
                  - 不顯示拖曳 handle
                  - cell 不可編輯
                  - 但仍正確套用 colWidths
                效果與預覽完全一致。
              */}
              {b.kind === "table" && <TableBlockView block={b} selected={false} />}
              {b.kind === "chart" && <ChartBlockView block={b} selected={false} />}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return createPortal(content, document.body);
});

/**
 * 【上下置中的 TextBlock】
 *
 * 嘗試演進史（記錄避免後人再踩雷）：
 *   1. flex column + justify-content:center
 *      → 瀏覽器 OK，html2canvas 1.x 把 column 當 stretch，匯出仍偏上/下
 *   2. display: table + table-cell + vertical-align: middle
 *      → 瀏覽器 OK，html2canvas 對 table 高度 100% 推導不可靠，匯出仍偏下
 *   3. position: absolute + top: 50% + transform: translateY(-50%)
 *      → 瀏覽器 OK，但 html2canvas 對「百分比的 transform」處理不可靠：
 *        它吃下 top:50%（把內容推到下半部）卻忽略 translateY(-50%)
 *        補回來的部分，所以匯出後文字仍偏下。
 *   4. position: absolute + top: <JS 算的 px>
 *      → 仍然偏下。推測 html2canvas 在處理巢狀 absolute / relative 容器時，
 *        對子元素 top:<px> 的計算有 off-by-something 的問題。
 *   5. ✅ 現行：純 normal flow + JS 算的 marginTop（可正可負）
 *      → 完全沒有 absolute 定位，只用最古老最穩固的 margin-top 把內容
 *        往下推或往上拉到正中央。所有 CSS 引擎（含 html2canvas）對
 *        margin-top 的支援都是滿格的。
 *
 * 結構：
 *   外層 containerRef（block 大小、背景/邊框、overflow:hidden、無 padding）
 *     └─ 內層 contentRef（marginTop = JS 算的偏移量，padding/字型 在這層）
 *          └─ wrapper（dangerouslySetInnerHTML，inline 內容自然排版）
 *
 * useLayoutEffect 在 React commit 後、瀏覽器 paint 前計算：
 *   marginTop = (containerHeight - contentHeight) / 2
 *   - 若內容比容器矮 → margin 為正，把內容往下推到中央
 *   - 若內容比容器高 → margin 為負（margin-top 可以是負值），
 *     把內容上拉，讓 overflow:hidden 上下對稱裁切
 *
 * 與 PreviewView 共用同一個元件，確保「預覽 = 匯出」絕對一致。
 */
export function CenteredTextBlock({
  block,
}: {
  block: Extract<CanvasBlock, { kind: "text" }>;
}) {
  const s = block.style;
  // line-height 預設 1.2：html2canvas 對 line-height:normal 的解讀是 1.0,
  // 與瀏覽器（~1.15-1.2）有落差。明寫 1.2 把兩邊對齊，避免 descender 被切。
  const lineHeight = s.lineHeight ?? 1.2;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  // 估算 marginTop 初值，避免第一個 frame 文字閃在頂端
  const estimatedContentH =
    (typeof s.fontSize === "number" ? s.fontSize : 16) * lineHeight +
    (typeof s.padding === "number" ? s.padding * 2 : 0);
  const [marginTop, setMarginTop] = React.useState<number>(
    (block.h - estimatedContentH) / 2
  );

  React.useLayoutEffect(() => {
    if (!containerRef.current || !contentRef.current) return;
    const measure = () => {
      // 用 block.h（資料層既知值）而非 clientHeight：避免巢狀 boxSizing
      // 計算誤差讓 ch 跑掉（在 html2canvas 的 cloned DOM 中尤其常見）
      const ch = block.h;
      const tc = contentRef.current?.offsetHeight ?? 0;
      const next = (ch - tc) / 2;
      setMarginTop(next);
    };
    measure();
    // 字型載入完成後再量一次（中文字型比 fallback 高，content 高度會變）
    if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
      void document.fonts.ready.then(measure).catch(() => undefined);
    }
  }, [block.html, block.h, block.w, s.fontSize, s.padding, lineHeight]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        backgroundColor: s.backgroundColor,
        borderRadius: s.borderRadius,
        border:
          s.borderWidth && s.borderColor
            ? `${s.borderWidth}px solid ${s.borderColor}`
            : undefined,
        overflow: "hidden",
      }}
    >
      <div
        ref={contentRef}
        style={{
          // ↓↓↓ 真正讓內容垂直置中的關鍵：基本到不能再基本的 margin-top ↓↓↓
          marginTop,
          padding: s.padding,
          boxSizing: "border-box",
          color: s.color,
          fontFamily: s.fontFamily,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
          fontStyle: s.fontStyle,
          textDecoration: s.textDecoration,
          textAlign: s.textAlign,
          lineHeight,
        }}
      >
        <div
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      </div>
    </div>
  );
}
