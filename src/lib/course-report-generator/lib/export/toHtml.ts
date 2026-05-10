"use client";

/**
 * 【匯出 HTML（單檔）】
 *
 * 兩種模式：
 *   - "linear"（預設、推薦）：把所有 block 按 y 座標排序、垂直 stack，
 *     **永不重疊**。適合「報告」型內容：章節 banner → 表格 → 條列 …
 *     會自然由上到下閱讀。失去自由排版（同 y 的並排會被拆成上下兩列），
 *     但每塊內容都完整可讀。
 *   - "absolute"：忠實保留 canvas 的 absolute positioning，等同
 *     「截圖式」匯出。如果使用者刻意設計多欄、圖片旁文字，這個模式
 *     會保留版面；但若 block 在 canvas 上座標重疊，匯出後也會重疊。
 *
 * 為什麼要分兩種：
 *   自由畫布讓使用者拖 block 到任意位置；長報告很容易在 1280×1700
 *   stage 內 block 互相重疊（編輯器縮放預覽下不一定看得出）。HTML
 *   匯出原本忠實複製 absolute layout，重疊就直接呈現出來，使用者體
 *   感是「標題蓋到內容」。改 linear 為預設可避免大多數情境下的重疊
 *   問題；保留 absolute 給刻意做多欄版面的使用者。
 */
import { saveAs } from "file-saver";
import { sanitizeFilename } from "../utils";

export type HtmlExportMode = "linear" | "absolute";

export function exportToHtml(
  node: HTMLElement,
  filename: string,
  title: string,
  mode: HtmlExportMode = "linear",
): void {
  const cloned = node.cloneNode(true) as HTMLElement;

  // 把所有 contentEditable 改回 false（避免使用者誤以為打開的 HTML 可編輯）
  cloned.querySelectorAll("[contenteditable]").forEach((el) => {
    el.removeAttribute("contenteditable");
  });

  // 注入 computed style（只取重要屬性，避免太大）
  const allEls = [cloned, ...Array.from(cloned.querySelectorAll<HTMLElement>("*"))];
  const sourceAllEls = [node, ...Array.from(node.querySelectorAll<HTMLElement>("*"))];
  const KEYS = [
    "color",
    "background",
    "background-color",
    "background-image",
    "border",
    "border-radius",
    "padding",
    "margin",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "text-align",
    "line-height",
    "display",
    "position",
    "left",
    "top",
    "width",
    "height",
    "min-height",
    "max-width",
    "transform",
    "transform-origin",
    "z-index",
    "box-shadow",
    "outline",
    "overflow",
  ];
  allEls.forEach((el, i) => {
    const src = sourceAllEls[i];
    if (!src) return;
    const computed = window.getComputedStyle(src);
    const styleParts: string[] = [];
    for (const k of KEYS) {
      const v = computed.getPropertyValue(k);
      if (v && v !== "none" && v !== "normal" && v !== "0px" && v !== "auto") {
        styleParts.push(`${k}:${v}`);
      }
    }
    el.setAttribute("style", styleParts.join(";"));
  });

  // ─── linear 模式：把直接子 block 從 absolute 重排為垂直線性流 ───
  let bodyInner: string;
  if (mode === "linear" && isCanvasStage(node)) {
    bodyInner = buildLinearLayout(cloned, node);
  } else {
    bodyInner = cloned.outerHTML;
  }

  const linearNote =
    mode === "linear"
      ? `<p style="margin: 0 0 16px; color:#64748b; font-size: 12px;">📄 線性排版模式：所有區塊按上下順序排列，避免互相遮蓋。如需保留原 canvas 自由版型，請改用「下載 HTML（自由版型）」。</p>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 24px; background: #f1f5f9; font-family: 'Noto Sans TC', sans-serif; }
  .course-report-export-wrap { background: #fff; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); border-radius: 8px; max-width: 1340px; margin: 0 auto; }
  table { border-collapse: collapse; }
</style>
</head>
<body>
<div class="course-report-export-wrap">
${linearNote}
${bodyInner}
</div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  saveAs(blob, `${sanitizeFilename(filename)}.html`);
}

/**
 * 判斷 node 是否是「畫布 stage」(報告編輯器的自由畫布根)。
 * 只有畫布有 absolute-positioned 的直接子 block 需要做 linear 重排；
 * 表單模式的 stage 內容是 normal flow，不需要也不能做這件事。
 */
function isCanvasStage(node: HTMLElement): boolean {
  return node.getAttribute("data-export-root") === "course-report-canvas";
}

/**
 * 把 canvas stage 內所有 absolute 定位的 block 按 y 排序、轉成 normal flow。
 *
 * 從原始 source DOM 讀 (x, y, w, h) 數值（不依賴 inline style，因為 ExportRenderer
 * 用的是 React style 物件而非 cssText，cloned.style.top 不一定可解析），用
 * getBoundingClientRect 先讀出絕對位置，再相對 stage 計算。
 */
function buildLinearLayout(cloned: HTMLElement, source: HTMLElement): string {
  const sourceChildren = Array.from(source.children) as HTMLElement[];
  const clonedChildren = Array.from(cloned.children) as HTMLElement[];
  if (sourceChildren.length !== clonedChildren.length) {
    return cloned.outerHTML;
  }

  const stageRect = source.getBoundingClientRect();
  const items = sourceChildren.map((src, i) => {
    const r = src.getBoundingClientRect();
    return {
      el: clonedChildren[i],
      x: r.left - stageRect.left,
      y: r.top - stageRect.top,
      w: r.width || src.offsetWidth || 0,
      h: r.height || src.offsetHeight || 0,
    };
  });

  // 按 y 排序，同 y 時按 x 排序（左在前）
  items.sort((a, b) => a.y - b.y || a.x - b.x);

  // 把每個 block 從 absolute 改成 normal flow
  for (const it of items) {
    if (!it.el) continue;
    // override 掉 inline style 中的 absolute 相關屬性
    it.el.style.position = "static";
    it.el.style.left = "";
    it.el.style.top = "";
    // 維持原 block 視覺寬度，居中（避免長報告占滿 1340 太空曠）
    it.el.style.width = `${Math.round(it.w)}px`;
    it.el.style.maxWidth = "100%";
    it.el.style.minHeight = `${Math.round(it.h)}px`;
    it.el.style.marginLeft = "auto";
    it.el.style.marginRight = "auto";
    it.el.style.marginBottom = "16px";
    // linear 模式下不再 hidden 內容，讓內容自然撐高（避免被裁）
    it.el.style.overflow = "visible";
  }

  return `<div style="display: flex; flex-direction: column; align-items: stretch;">
${items.map((it) => it.el?.outerHTML ?? "").join("\n")}
</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
