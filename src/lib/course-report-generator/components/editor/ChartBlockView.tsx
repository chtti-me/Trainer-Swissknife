"use client";

/**
 * 【ChartBlock 渲染】
 *
 * 用 canvas 2D API 自繪簡單圖表（bar / line / pie / doughnut），
 * 同時把渲染結果存成 PNG dataURL（spec.pngDataUrl），方便後續匯出 PPTX/DOCX 直接嵌入。
 *
 * 為了避免引入額外 chart 套件（chart.js 約 200KB），這裡用手刻最小可用版本，
 * 已涵蓋報告場景的常見需求。
 */
import * as React from "react";
import type { CanvasBlock, ChartSpec } from "../../types/report";
import { useReportStore } from "../../store/reportStore";

interface Props {
  block: Extract<CanvasBlock, { kind: "chart" }>;
  selected: boolean;
}

const COLORS = ["#1f3a8a", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

export function ChartBlockView({ block }: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const updateBlock = useReportStore((s) => s.updateBlock);

  React.useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    // 用 block.w/h 渲染（再以 CSS 縮放到實際顯示）
    const dpr = window.devicePixelRatio || 1;
    c.width = block.w * dpr;
    c.height = block.h * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, block.w, block.h);
    drawChart(ctx, block.spec, block.w, block.h);
    // 存 PNG dataURL，方便匯出時直接拿
    try {
      const dataUrl = c.toDataURL("image/png");
      if (dataUrl !== block.spec.pngDataUrl) {
        updateBlock(block.id, { spec: { ...block.spec, pngDataUrl: dataUrl } } as Partial<CanvasBlock>);
      }
    } catch {
      // ignore
    }
  }, [block.id, block.w, block.h, block.spec, updateBlock]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", backgroundColor: "#fff" }}
    />
  );
}

function drawChart(ctx: CanvasRenderingContext2D, spec: ChartSpec, w: number, h: number) {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);

  // 標題
  let topPad = 16;
  if (spec.title) {
    ctx.fillStyle = "#22263a";
    ctx.font = "bold 14px Noto Sans TC, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(spec.title, w / 2, 20);
    topPad = 36;
  }

  if (spec.type === "bar") {
    drawBar(ctx, spec, w, h, topPad);
  } else if (spec.type === "line") {
    drawLine(ctx, spec, w, h, topPad);
  } else if (spec.type === "pie" || spec.type === "doughnut") {
    drawPie(ctx, spec, w, h, topPad, spec.type === "doughnut");
  }
}

function drawBar(ctx: CanvasRenderingContext2D, spec: ChartSpec, w: number, h: number, top: number) {
  const padL = 50;
  const padR = 12;
  const padB = 30;
  const chartH = h - top - padB;
  const chartW = w - padL - padR;
  const ds = spec.datasets[0];
  if (!ds) return;
  const max = Math.max(...ds.data, 1);
  const barW = (chartW / spec.labels.length) * 0.7;
  const gap = (chartW / spec.labels.length) * 0.3;

  // Y 軸標線（4 條）
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#6b7280";
  ctx.font = "11px Noto Sans TC";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const y = top + (chartH * (4 - i)) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.fillText(((max * i) / 4).toFixed(0), padL - 4, y + 3);
  }

  // bars
  spec.labels.forEach((label, i) => {
    const v = ds.data[i] ?? 0;
    const x = padL + i * (barW + gap) + gap / 2;
    const barH = (v / max) * chartH;
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fillRect(x, top + chartH - barH, barW, barH);
    // value label
    ctx.fillStyle = "#22263a";
    ctx.font = "11px Noto Sans TC";
    ctx.textAlign = "center";
    ctx.fillText(String(v), x + barW / 2, top + chartH - barH - 4);
    // x label
    ctx.fillStyle = "#374151";
    ctx.fillText(label, x + barW / 2, top + chartH + 16);
  });
}

function drawLine(ctx: CanvasRenderingContext2D, spec: ChartSpec, w: number, h: number, top: number) {
  const padL = 50;
  const padR = 12;
  const padB = 30;
  const chartH = h - top - padB;
  const chartW = w - padL - padR;
  const ds = spec.datasets[0];
  if (!ds || ds.data.length < 2) return;
  const max = Math.max(...ds.data, 1);

  // grid
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#6b7280";
  ctx.font = "11px Noto Sans TC";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const y = top + (chartH * (4 - i)) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.fillText(((max * i) / 4).toFixed(0), padL - 4, y + 3);
  }

  // line
  ctx.strokeStyle = COLORS[0];
  ctx.lineWidth = 2;
  ctx.beginPath();
  ds.data.forEach((v, i) => {
    const x = padL + (chartW * i) / (ds.data.length - 1);
    const y = top + chartH - (v / max) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // points
  ds.data.forEach((v, i) => {
    const x = padL + (chartW * i) / (ds.data.length - 1);
    const y = top + chartH - (v / max) * chartH;
    ctx.fillStyle = COLORS[0];
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#374151";
    ctx.font = "11px Noto Sans TC";
    ctx.textAlign = "center";
    ctx.fillText(spec.labels[i] ?? "", x, top + chartH + 16);
  });
}

function drawPie(ctx: CanvasRenderingContext2D, spec: ChartSpec, w: number, h: number, top: number, isDoughnut: boolean) {
  const ds = spec.datasets[0];
  if (!ds) return;
  const total = ds.data.reduce((a, b) => a + b, 0);
  if (total <= 0) return;
  const cx = w / 2;
  const cy = top + (h - top) / 2;
  const radius = Math.min(w, h - top) / 2 - 30;
  const innerR = isDoughnut ? radius * 0.5 : 0;
  let start = -Math.PI / 2;

  ds.data.forEach((v, i) => {
    const angle = (v / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fill();
    // label
    const mid = start + angle / 2;
    const lx = cx + Math.cos(mid) * (radius * 0.7);
    const ly = cy + Math.sin(mid) * (radius * 0.7);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px Noto Sans TC";
    ctx.textAlign = "center";
    const pct = ((v / total) * 100).toFixed(0);
    ctx.fillText(`${pct}%`, lx, ly);
    start += angle;
  });

  if (isDoughnut) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fill();
  }

  // legend
  ctx.font = "11px Noto Sans TC";
  ctx.textAlign = "left";
  spec.labels.forEach((label, i) => {
    const lx = 10;
    const ly = top + 12 + i * 14;
    if (ly > h - 6) return;
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fillRect(lx, ly - 8, 10, 10);
    ctx.fillStyle = "#374151";
    ctx.fillText(label, lx + 14, ly);
  });
}
