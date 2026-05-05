"use client";

/**
 * 【匯出 PPTX】
 *
 * - 自由畫布模式：把每個 CanvasBlock 轉成 PPTX 元素（text/image/table），1280x720 stage
 * - 制式表單模式：截圖整份報告 → 切片成多張投影片
 *
 * 注意：pptxgenjs 內部 import("node:fs") / import("node:https") 的呼叫只在
 * Node runtime 觸發；在 browser bundle 中由 next.config.ts 的 webpack externals
 * 攔截為空模組，所以實際執行不會炸（client 走 writeFileToBrowser 路徑）。
 *
 * 為避免 SSR/initial chunk 過大，仍透過 dynamic import 在實際匯出時才載入。
 *
 * 制式表單模式截圖：改用 html-to-image（瀏覽器 native render），
 * 文字位置與預覽完全一致。詳見 toPng.ts。
 */
import { toCanvas } from "html-to-image";
import { saveAs } from "file-saver";
import type { CourseReport } from "../../types/report";
import { sanitizeFilename } from "../utils";

type PptxGenJSModule = typeof import("pptxgenjs");
type PptxGenJSCtor = PptxGenJSModule["default"];
type PptxGenJSInstance = InstanceType<PptxGenJSCtor>;

async function loadPptxGenJS(): Promise<PptxGenJSCtor> {
  const mod = (await import("pptxgenjs")) as PptxGenJSModule;
  return mod.default;
}

const STAGE_W = 1280;
const STAGE_H = 1700; // 我們畫布是 1700px 高，PPTX 一張 720，所以可能 2–3 張

const PT_PER_PX = 0.75; // 1 px ≈ 0.75 pt
const PPTX_W_IN = 13.33; // 16:9 寬度
const PPTX_H_IN = 7.5;
const STAGE_DISPLAY_W_IN = PPTX_W_IN; // 整個 stage 寬對齊投影片
const PX_TO_IN = STAGE_DISPLAY_W_IN / STAGE_W;

// ──────────────────────────── 自由畫布模式 ────────────────────────────

async function pptxFromCanvasBlocks(report: CourseReport, pptx: PptxGenJSInstance) {
  // 切片：把 1280x1700 切成多張 1280x(720/scale)
  const sliceHeightPx = STAGE_W * (PPTX_H_IN / PPTX_W_IN); // 1280 × 0.5625 = 720
  const slices = Math.ceil(STAGE_H / sliceHeightPx);

  for (let i = 0; i < slices; i++) {
    const slide = pptx.addSlide();
    slide.background = { color: getPaperHex(report) };

    const sliceTopPx = i * sliceHeightPx;
    const sliceBottomPx = (i + 1) * sliceHeightPx;

    for (const b of report.canvas) {
      const blockBottom = b.y + b.h;
      // 與此切片有重疊
      if (blockBottom < sliceTopPx || b.y > sliceBottomPx) continue;
      const xIn = b.x * PX_TO_IN;
      const yIn = (b.y - sliceTopPx) * PX_TO_IN;
      const wIn = b.w * PX_TO_IN;
      const hIn = b.h * PX_TO_IN;

      if (b.kind === "text") {
        slide.addText(stripHtmlToPlain(b.html), {
          x: xIn,
          y: yIn,
          w: wIn,
          h: hIn,
          fontFace: b.style.fontFamily?.split(",")[0] || "Noto Sans TC",
          fontSize: (b.style.fontSize ?? 16) * PT_PER_PX,
          color: (b.style.color ?? "#22263a").replace("#", ""),
          fill:
            b.style.backgroundColor && b.style.backgroundColor !== "transparent"
              ? { color: b.style.backgroundColor.replace("#", "") }
              : undefined,
          bold: b.style.fontWeight === "bold" || (typeof b.style.fontWeight === "number" && b.style.fontWeight >= 600),
          italic: b.style.fontStyle === "italic",
          align: (b.style.textAlign as "left" | "center" | "right") ?? "left",
          valign: "top",
        });
      } else if (b.kind === "image") {
        slide.addImage({
          data: b.src,
          x: xIn,
          y: yIn,
          w: wIn,
          h: hIn,
        });
      } else if (b.kind === "chart") {
        if (b.spec.pngDataUrl) {
          slide.addImage({
            data: b.spec.pngDataUrl,
            x: xIn,
            y: yIn,
            w: wIn,
            h: hIn,
          });
        } else {
          slide.addText(b.spec.title || "（圖表）", {
            x: xIn,
            y: yIn,
            w: wIn,
            h: hIn,
            fontSize: 14,
          });
        }
      } else if (b.kind === "table") {
        const tableRows = b.rows.map((row, ri) => {
          const isHeader = ri === 0 && b.hasHeader;
          return row.map((cell) => ({
            text: cell,
            options: {
              fontSize: (b.style.fontSize ?? 14) * PT_PER_PX,
              color: isHeader
                ? (b.style.headerColor ?? "#ffffff").replace("#", "")
                : (b.style.cellColor ?? "#22263a").replace("#", ""),
              fill: {
                color: isHeader
                  ? (b.style.headerBg ?? "#1f3a8a").replace("#", "")
                  : (b.style.cellBg ?? "#ffffff").replace("#", ""),
              },
              bold: isHeader,
              // 表頭置中，資料儲存格維持預設左對齊
              align: isHeader ? "center" : "left",
            },
          }));
        });
        // colWidths（畫布像素）若有設定，依比例換算成 inch 並傳給 pptxgenjs
        let colW: number[] | undefined;
        if (
          Array.isArray(b.colWidths) &&
          b.colWidths.length === (b.rows[0]?.length ?? 0) &&
          b.colWidths.every((n) => typeof n === "number" && n > 0)
        ) {
          const totalLogical = b.colWidths.reduce((a, c) => a + c, 0);
          colW = b.colWidths.map((cw) => (cw / totalLogical) * wIn);
        }
        slide.addTable(tableRows, {
          x: xIn,
          y: yIn,
          w: wIn,
          h: hIn,
          colW,
          border: {
            type: "solid",
            color: (b.style.borderColor ?? "#cbd5e1").replace("#", ""),
            pt: 0.75,
          },
          fontFace: b.style.fontFamily?.split(",")[0] || "Noto Sans TC",
        });
      }
    }
  }
}

// ──────────────────────────── 制式表單模式 ────────────────────────────

async function pptxFromFormScreenshot(node: HTMLElement, pptx: PptxGenJSInstance) {
  // ExportRenderer 內已經是 read-only 的乾淨 DOM（沒有 native input/textarea），
  // 因此不再需要 _htmlPrep 那層 form control 替換。
  const canvas = await toCanvas(node, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    skipFonts: true,
    cacheBust: true,
  });
  const sliceHeightPx = canvas.width * (PPTX_H_IN / PPTX_W_IN);
  const slices = Math.ceil(canvas.height / sliceHeightPx);
  for (let i = 0; i < slices; i++) {
    const slide = pptx.addSlide();
    const sub = document.createElement("canvas");
    sub.width = canvas.width;
    sub.height = Math.min(sliceHeightPx, canvas.height - i * sliceHeightPx);
    const ctx = sub.getContext("2d");
    if (!ctx) continue;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, sub.width, sub.height);
    ctx.drawImage(canvas, 0, i * sliceHeightPx, canvas.width, sub.height, 0, 0, canvas.width, sub.height);
    const dataUrl = sub.toDataURL("image/jpeg", 0.92);
    slide.addImage({
      data: dataUrl,
      x: 0,
      y: 0,
      w: PPTX_W_IN,
      h: (sub.height / canvas.width) * PPTX_W_IN,
    });
  }
}

// ──────────────────────────── public ────────────────────────────

export async function exportToPptx(
  report: CourseReport,
  domNode: HTMLElement,
  filename: string
): Promise<void> {
  const Ctor = await loadPptxGenJS();
  const pptx = new Ctor();
  pptx.defineLayout({ name: "WIDE16_9", width: PPTX_W_IN, height: PPTX_H_IN });
  pptx.layout = "WIDE16_9";
  pptx.title = report.title || "課程規劃報告";
  pptx.author = report.reporter || "培訓師";

  // Cover slide
  const cover = pptx.addSlide();
  cover.background = { color: getPaperHex(report) };
  cover.addText(report.title || "（未命名課程規劃報告）", {
    x: 0.5,
    y: 1.5,
    w: PPTX_W_IN - 1,
    h: 1.5,
    fontSize: 36,
    bold: true,
    color: "1F3A8A",
    align: "center",
  });
  if (report.subtitle) {
    cover.addText(report.subtitle, {
      x: 0.5,
      y: 3.0,
      w: PPTX_W_IN - 1,
      h: 0.6,
      fontSize: 18,
      color: "3B82F6",
      align: "center",
    });
  }
  const meta = [
    report.department && `學系：${report.department}`,
    report.reporter && `報告人：${report.reporter}`,
    report.reportDate && `日期：${new Date(report.reportDate).toLocaleDateString("zh-TW")}`,
  ]
    .filter(Boolean)
    .join("    ");
  cover.addText(meta, {
    x: 0.5,
    y: 4.0,
    w: PPTX_W_IN - 1,
    h: 0.6,
    fontSize: 14,
    color: "374151",
    align: "center",
  });

  if (report.mode === "canvas" && report.canvas.length > 0) {
    await pptxFromCanvasBlocks(report, pptx);
  } else {
    await pptxFromFormScreenshot(domNode, pptx);
  }

  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  saveAs(blob, `${sanitizeFilename(filename)}.pptx`);
}

function getPaperHex(_report: CourseReport): string {
  // PptxGenJS 接受 hex（不含 #）
  return "FFFFFF";
}

function stripHtmlToPlain(html: string): string {
  if (typeof DOMParser === "undefined") {
    return html.replace(/<[^>]+>/g, "");
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent ?? "";
}
