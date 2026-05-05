"use client";

/**
 * 【匯出 PNG】
 *
 * 改用 html-to-image（取代 html2canvas）：
 *   原理是把 DOM 包進 SVG <foreignObject>，丟給 <img>，由瀏覽器 native
 *   render 引擎繪製這張 SVG，再用 ctx.drawImage 畫到 canvas。
 *   這樣產出的圖跟「預覽畫面看到的」完全是同一個渲染管線，文字 baseline
 *   不會有 html2canvas 的偏下問題。
 */
import { toCanvas } from "html-to-image";
import { saveAs } from "file-saver";
import { sanitizeFilename } from "../utils";

export async function exportToPng(node: HTMLElement, filename: string): Promise<void> {
  const canvas = await toCanvas(node, {
    // pixelRatio 對應 html2canvas 的 scale，高 DPI 出圖
    pixelRatio: 2,
    // 用紙張色作為底（透明也可以，但 PNG 多半不會是透明背景，給白底更穩）
    backgroundColor: "#ffffff",
    // 跳過字型 inline，改完全相依當前頁面已載入的 web font
    // （我們匯出前已 await document.fonts.ready，這裡省掉冗長的 base64 內嵌）
    skipFonts: true,
    cacheBust: true,
  });
  await new Promise<void>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("無法產生 PNG blob"));
          return;
        }
        saveAs(blob, `${sanitizeFilename(filename)}.png`);
        resolve();
      },
      "image/png",
      1
    );
  });
}
