"use client";

/**
 * 【匯出 HTML（單檔）】
 *
 * 把指定 DOM 的 HTML + computed style 序列化成獨立可開啟的 HTML 檔。
 * 為了簡化、減少 styled element 失真，只 inline 必要 style，
 * 對於影像則直接 base64 in 嵌（HTML 變大，但獨立可攜）。
 */
import { saveAs } from "file-saver";
import { sanitizeFilename } from "../utils";

export function exportToHtml(node: HTMLElement, filename: string, title: string): void {
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

  const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 24px; background: #f1f5f9; font-family: 'Noto Sans TC', sans-serif; }
  .course-report-export-wrap { background: #fff; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); border-radius: 8px; }
  table { border-collapse: collapse; }
</style>
</head>
<body>
<div class="course-report-export-wrap">
${cloned.outerHTML}
</div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  saveAs(blob, `${sanitizeFilename(filename)}.html`);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
