/**
 * 【課程規劃報告產生器 - 共用：把報告轉成初始 canvas blocks】
 *
 * 各模板的 renderCanvasInitial 通常會呼叫這裡的工具，再覆蓋自己的版型細節
 *（例如：Header block 的位置、字級、是否要加 logo）。
 */
import type { CanvasBlock, CourseReport } from "../../types/report";
import type { Palette } from "../../types/template";
import { newId } from "../utils";

const CANVAS_W = 1280;
const PADDING = 64;

/** 把 SessionRow[] 轉成 canvas TableBlock 的二維 rows */
function sessionsToRows(report: CourseReport, includeHeader = true): string[][] {
  const rows: string[][] = [];
  if (includeHeader) {
    rows.push(["日期", "時間", "課程主題", "講師", "亮點"]);
  }
  for (const s of report.design.sessions) {
    rows.push([s.date || "", s.timeRange || "", s.topic || "", s.instructor || "", s.highlights || ""]);
  }
  return rows;
}

interface CanvasInitialOptions {
  /** 標題字級 */
  titleFontSize?: number;
  /** Section 標題的背景色（不填則用 palette.primary） */
  sectionBg?: string;
  /** 額外註解：是否在最開頭加大色塊（modern-card 模板用） */
  withColorBlock?: boolean;
  /** 表格表頭背景 */
  tableHeaderBg?: string;
}

export function buildDefaultCanvasInitial(
  report: CourseReport,
  palette: Palette,
  options: CanvasInitialOptions = {}
): CanvasBlock[] {
  const blocks: CanvasBlock[] = [];
  let y = PADDING;

  if (options.withColorBlock) {
    // 上方裝飾色塊（用 image-as-background 太重，這裡用 text block + bg color 仿）
    blocks.push({
      kind: "text",
      id: newId(),
      x: 0,
      y: 0,
      w: CANVAS_W,
      h: 48,
      html: "",
      style: {
        backgroundColor: palette.accent,
        padding: 0,
      },
    });
    y = 64;
  }

  // 標題
  blocks.push({
    kind: "text",
    id: newId(),
    x: PADDING,
    y,
    w: CANVAS_W - PADDING * 2,
    h: 80,
    html: `<strong>${escapeHtml(report.title || "（未命名課程規劃報告）")}</strong>`,
    style: {
      fontFamily: "Noto Sans TC, sans-serif",
      fontSize: options.titleFontSize ?? 36,
      fontWeight: "bold",
      color: palette.primary,
      backgroundColor: "transparent",
      textAlign: "left",
      padding: 0,
    },
  });
  y += 90;

  // 副標 / 報告人 / 日期
  const metaLine = [
    report.subtitle && `<span style="color:${palette.accent}">${escapeHtml(report.subtitle)}</span>`,
    report.reporter && `報告人：<strong>${escapeHtml(report.reporter)}</strong>`,
    report.department && `學系：<strong>${escapeHtml(report.department)}</strong>`,
    report.reportDate && `日期：<strong>${escapeHtml(new Date(report.reportDate).toLocaleDateString("zh-TW"))}</strong>`,
  ]
    .filter(Boolean)
    .join("　｜　");
  blocks.push({
    kind: "text",
    id: newId(),
    x: PADDING,
    y,
    w: CANVAS_W - PADDING * 2,
    h: 36,
    html: metaLine,
    style: {
      fontSize: 14,
      color: palette.ink,
      padding: 0,
      backgroundColor: "transparent",
    },
  });
  y += 60;

  // 案由與目的
  // ⚠️ 高度 50（不是更小的 38）：fontSize=20 + lineHeight=1.4 = 28px 文字，再加上下
  // padding=8 各邊，最少需要 44px。給到 50 留出 6px 安全餘量，避免 html2canvas 把
  // 字底切掉（這是先前匯出 PNG/PDF 標題列下緣被遮的根本原因之一）。
  blocks.push({
    kind: "text",
    id: newId(),
    x: PADDING,
    y,
    w: CANVAS_W - PADDING * 2,
    h: 50,
    html: `<strong>壹、案由與目的</strong>`,
    style: {
      fontSize: 20,
      fontWeight: "bold",
      color: palette.primaryFg,
      backgroundColor: options.sectionBg ?? palette.primary,
      padding: 8,
      borderRadius: 4,
    },
  });
  y += 62;

  const purposeText = report.purpose || "（請填寫案由與目的）";
  const purposeH = Math.max(80, Math.min(260, Math.ceil(purposeText.length / 40) * 28));
  blocks.push({
    kind: "text",
    id: newId(),
    x: PADDING,
    y,
    w: CANVAS_W - PADDING * 2,
    h: purposeH,
    html: escapeHtml(purposeText).replace(/\n/g, "<br>"),
    style: {
      fontSize: 16,
      color: palette.ink,
      lineHeight: 1.7,
      padding: 12,
      backgroundColor: palette.paper,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 6,
    },
  });
  y += purposeH + 24;

  // 課程規劃（高度 50 同壹節之說明）
  blocks.push({
    kind: "text",
    id: newId(),
    x: PADDING,
    y,
    w: CANVAS_W - PADDING * 2,
    h: 50,
    html: `<strong>貳、課程規劃</strong>`,
    style: {
      fontSize: 20,
      fontWeight: "bold",
      color: palette.primaryFg,
      backgroundColor: options.sectionBg ?? palette.primary,
      padding: 8,
      borderRadius: 4,
    },
  });
  y += 62;

  // 課程規劃前言（即使 summary 為空，也預設出現一個可編輯文字框，
  // 跟「壹、案由與目的」一致，方便使用者直接點進去寫）
  {
    const summaryText = report.design.summary || "（請填寫本系列課程的整體規劃概述，例如分成幾個梯次、由哪些講師授課、整體時程安排等）";
    const summaryH = Math.max(80, Math.min(220, Math.ceil(summaryText.length / 40) * 26));
    blocks.push({
      kind: "text",
      id: newId(),
      x: PADDING,
      y,
      w: CANVAS_W - PADDING * 2,
      h: summaryH,
      html: escapeHtml(summaryText).replace(/\n/g, "<br>"),
      style: {
        fontSize: 16,
        color: palette.ink,
        lineHeight: 1.7,
        padding: 12,
        backgroundColor: palette.paper,
        borderWidth: 1,
        borderColor: palette.border,
        borderRadius: 6,
      },
    });
    y += summaryH + 16;
  }

  // 課程節次表格：若有資料就直接畫表格；無資料則放預設 3 列空表格，方便使用者填寫
  {
    const hasData = report.design.sessions.length > 0;
    const rows = hasData
      ? sessionsToRows(report, true)
      : [
          ["日期", "時間", "課程主題", "講師", "亮點"],
          ["", "", "", "", ""],
          ["", "", "", "", ""],
          ["", "", "", "", ""],
        ];
    const tableH = Math.max(80, 40 + (rows.length - 1) * 50);
    blocks.push({
      kind: "table",
      id: newId(),
      x: PADDING,
      y,
      w: CANVAS_W - PADDING * 2,
      h: tableH,
      rows,
      hasHeader: true,
      style: {
        fontSize: 13,
        headerBg: options.tableHeaderBg ?? palette.tableHeaderBg,
        headerColor: palette.tableHeaderFg,
        cellBg: palette.paper,
        cellColor: palette.ink,
        borderColor: palette.tableBorder,
        borderWidth: 1,
      },
    });
    y += tableH + 24;
  }

  // 效益（高度 50 同壹節之說明）
  blocks.push({
    kind: "text",
    id: newId(),
    x: PADDING,
    y,
    w: CANVAS_W - PADDING * 2,
    h: 50,
    html: `<strong>參、預期效益</strong>`,
    style: {
      fontSize: 20,
      fontWeight: "bold",
      color: palette.primaryFg,
      backgroundColor: options.sectionBg ?? palette.primary,
      padding: 8,
      borderRadius: 4,
    },
  });
  y += 62;

  // 預期效益：即使尚未填寫，也預設出現一個可編輯文字框（與壹、貳一致）
  {
    let html: string;
    let h: number;
    if (report.benefits.length > 0) {
      const items = report.benefits
        .map((b) => `<li style="margin-bottom:8px;">${escapeHtml(b).replace(/\n/g, "<br>")}</li>`)
        .join("");
      html = `<ul style="padding-left:20px;margin:0;">${items}</ul>`;
      h = Math.max(80, 24 + report.benefits.length * 36);
    } else {
      html = `<ul style="padding-left:20px;margin:0;"><li style="margin-bottom:8px;">（請填寫第一項預期效益，例如：可協助公司提升 OO 流程效率約 30%）</li><li style="margin-bottom:8px;">（請填寫第二項預期效益，例如：預估年度可節省 OO 工時、降低 OO 成本）</li><li style="margin-bottom:8px;">（請填寫第三項預期效益，例如：強化團隊在 OO 領域的專業競爭力）</li></ul>`;
      h = 140;
    }
    blocks.push({
      kind: "text",
      id: newId(),
      x: PADDING,
      y,
      w: CANVAS_W - PADDING * 2,
      h,
      html,
      style: {
        fontSize: 16,
        color: palette.ink,
        lineHeight: 1.7,
        padding: 12,
        backgroundColor: palette.paper,
        borderWidth: 1,
        borderColor: palette.border,
        borderRadius: 6,
      },
    });
    y += h + 24;
  }

  return blocks;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
