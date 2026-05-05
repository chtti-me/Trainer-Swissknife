"use client";

/**
 * 【匯出 DOCX（自由畫布模式 - HTML+Word MIME 取巧法）】
 *
 * 因為 Word 對 HTML+xmlns:office 命名空間有相容支援，
 * 我們把畫布 DOM serialize 後加上 Office 命名空間，副檔名 .doc
 * （Word 仍能開啟並可保留多數樣式）。對於完全可編輯的 DOCX，
 * 請改用「制式表單」+「下載 DOCX」（走 server toDocxStructured）。
 */
import { saveAs } from "file-saver";
import { sanitizeFilename } from "../utils";

export function exportCanvasToDoc(node: HTMLElement, filename: string, title: string): void {
  const cloned = node.cloneNode(true) as HTMLElement;
  cloned.querySelectorAll("[contenteditable]").forEach((el) => el.removeAttribute("contenteditable"));

  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office'
xmlns:w='urn:schemas-microsoft-com:office:word'
xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<!--[if gte mso 9]><xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
<w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml><![endif]-->
<style>
@page WordSection1 { size: A4 landscape; margin: 1cm; }
div.WordSection1 { page: WordSection1; }
body { font-family: 'Noto Sans TC', '標楷體', sans-serif; }
table { border-collapse: collapse; }
</style>
</head>
<body>
<div class="WordSection1">${cloned.outerHTML}</div>
</body>
</html>`;

  const blob = new Blob(["\uFEFF", html], {
    type: "application/msword;charset=utf-8",
  });
  saveAs(blob, `${sanitizeFilename(filename)}.doc`);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
