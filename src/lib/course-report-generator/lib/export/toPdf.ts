"use client";

/**
 * 【匯出 PDF】
 * 用 html-to-image 把報告 DOM 渲染成 canvas（瀏覽器 native render，
 * 文字位置會跟預覽畫面完全一致），再用 jsPDF 組多頁 A4 PDF。
 *
 * 不再使用 html2canvas（中文字 baseline 偏下無法解決，見 toPng.ts 註解）。
 */
import { toCanvas } from "html-to-image";
import jsPDF from "jspdf";
import { sanitizeFilename } from "../utils";

const A4_W = 595.28; // points
const A4_H = 841.89;
const MARGIN = 24;

export async function exportToPdf(node: HTMLElement, filename: string): Promise<void> {
  const canvas = await toCanvas(node, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    skipFonts: true,
    cacheBust: true,
  });

  const imgWPx = canvas.width;
  const imgHPx = canvas.height;

  // 等比放到 A4 寬（扣掉左右 margin）
  const targetW = A4_W - MARGIN * 2;
  const ratio = targetW / imgWPx;
  const targetH = imgHPx * ratio;

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });

  // 多頁切片：把整張 canvas 切成 N 個 A4 高的部份分頁加入
  const pageContentH = A4_H - MARGIN * 2;
  let drawn = 0;
  let pageIndex = 0;
  // 用 sub-canvas 切片以避免一張很大的 image base64 同時放
  while (drawn < targetH) {
    const sliceTopPx = Math.floor(drawn / ratio);
    const sliceHeightPx = Math.min(Math.ceil(pageContentH / ratio), imgHPx - sliceTopPx);
    if (sliceHeightPx <= 0) break;
    const sub = document.createElement("canvas");
    sub.width = imgWPx;
    sub.height = sliceHeightPx;
    const ctx = sub.getContext("2d");
    if (!ctx) break;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, sub.width, sub.height);
    ctx.drawImage(
      canvas,
      0,
      sliceTopPx,
      imgWPx,
      sliceHeightPx,
      0,
      0,
      imgWPx,
      sliceHeightPx
    );
    const dataUrl = sub.toDataURL("image/jpeg", 0.92);
    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(dataUrl, "JPEG", MARGIN, MARGIN, targetW, sliceHeightPx * ratio);
    drawn += sliceHeightPx * ratio;
    pageIndex += 1;
    if (pageIndex > 50) break; // 安全閥
  }

  pdf.save(`${sanitizeFilename(filename)}.pdf`);
}
