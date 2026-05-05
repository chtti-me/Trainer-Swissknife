/**
 * 【課程規劃報告產生器 - 匯出真 DOCX（制式表單模式）】
 *
 * 用 docx npm 套件組裝。Word 開啟後完全可編輯。
 * 圖片走 inline 排版（不保留 canvas 的絕對位置）。
 */
import "server-only";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  BorderStyle,
  type IBorderOptions,
  type ITableBordersOptions,
  ShadingType,
} from "docx";
import type { CourseReport } from "../../types/report";
import type { Palette } from "../../types/template";

function hex(color: string | undefined, fallback = "000000"): string {
  if (!color) return fallback;
  return color.replace(/^#/, "").toUpperCase();
}

function plainParagraphs(text: string, options?: { bold?: boolean; color?: string; size?: number }): Paragraph[] {
  if (!text) return [new Paragraph({ children: [new TextRun(" ")] })];
  return text.split(/\r?\n/).map(
    (line) =>
      new Paragraph({
        children: [
          new TextRun({
            text: line,
            bold: options?.bold,
            color: options?.color ? hex(options.color) : undefined,
            size: options?.size,
            font: "標楷體",
          }),
        ],
      })
  );
}

function sectionHeading(label: string, palette: Palette): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    shading: {
      type: ShadingType.SOLID,
      color: hex(palette.primary),
      fill: hex(palette.primary),
    },
    children: [
      new TextRun({
        text: label,
        bold: true,
        color: hex(palette.primaryFg, "FFFFFF"),
        size: 28,
        font: "標楷體",
      }),
    ],
  });
}

const tableBorders: ITableBordersOptions = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "999999" } as IBorderOptions,
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "999999" } as IBorderOptions,
  left: { style: BorderStyle.SINGLE, size: 4, color: "999999" } as IBorderOptions,
  right: { style: BorderStyle.SINGLE, size: 4, color: "999999" } as IBorderOptions,
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB" } as IBorderOptions,
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB" } as IBorderOptions,
};

function sessionTable(report: CourseReport, palette: Palette): Table {
  const headerCells = ["日期", "時間", "課程主題", "講師", "亮點"].map(
    (h) =>
      new TableCell({
        shading: {
          type: ShadingType.SOLID,
          color: hex(palette.tableHeaderBg),
          fill: hex(palette.tableHeaderBg),
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: h,
                bold: true,
                color: hex(palette.tableHeaderFg, "FFFFFF"),
                font: "標楷體",
              }),
            ],
          }),
        ],
      })
  );

  const rows = [
    new TableRow({ children: headerCells, tableHeader: true }),
    ...report.design.sessions.map(
      (s) =>
        new TableRow({
          children: [s.date, s.timeRange, s.topic, s.instructor, s.highlights].map(
            (v) =>
              new TableCell({
                children: plainParagraphs(v ?? "", { size: 20 }),
              })
          ),
        })
    ),
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows,
  });
}

export interface ToDocxParams {
  report: CourseReport;
  palette: Palette;
}

export async function toDocxStructured({ report, palette }: ToDocxParams): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  // Header：標題
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: report.title || "（未命名課程規劃報告）",
          bold: true,
          color: hex(palette.primary),
          size: 44,
          font: "標楷體",
        }),
      ],
    })
  );
  if (report.subtitle) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [
          new TextRun({
            text: report.subtitle,
            color: hex(palette.accent),
            size: 24,
            font: "標楷體",
          }),
        ],
      })
    );
  }

  // 中繼資訊
  const metaParts = [
    report.department && `學系：${report.department}`,
    report.reporter && `報告人：${report.reporter}`,
    report.reportDate && `日期：${new Date(report.reportDate).toLocaleDateString("zh-TW")}`,
  ].filter(Boolean);
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
      children: [
        new TextRun({
          text: metaParts.join("　｜　"),
          color: hex(palette.ink),
          size: 22,
          font: "標楷體",
        }),
      ],
    })
  );

  // 案由與目的
  children.push(sectionHeading("壹、案由與目的", palette));
  children.push(...plainParagraphs(report.purpose || "（請填寫案由與目的）", { size: 22 }));

  // 課程規劃
  children.push(sectionHeading("貳、課程規劃", palette));
  if (report.design.summary) {
    children.push(...plainParagraphs(report.design.summary, { size: 22 }));
    children.push(new Paragraph({ children: [new TextRun(" ")] }));
  }
  if (report.design.sessions.length > 0) {
    children.push(sessionTable(report, palette));
  } else {
    children.push(...plainParagraphs("（尚無課程節次資料）", { size: 22 }));
  }

  // 效益
  children.push(sectionHeading("參、預期效益", palette));
  if (report.benefits.length === 0) {
    children.push(...plainParagraphs("（尚無效益描述）", { size: 22 }));
  } else {
    report.benefits.forEach((b) => {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: b, size: 22, font: "標楷體" })],
        })
      );
    });
  }

  const doc = new Document({
    creator: "培訓師瑞士刀 — 課程規劃報告產生器",
    title: report.title || "課程規劃報告",
    styles: {
      default: {
        document: {
          run: { font: "標楷體", size: 22 },
        },
      },
    },
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}
