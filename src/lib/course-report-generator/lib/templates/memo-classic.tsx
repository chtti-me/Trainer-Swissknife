/**
 * 【模板：memo-classic】
 * 純文字段落 + 簡單表格，最像範例 docx，作 fallback。
 */
import * as React from "react";
import type { Template } from "../../types/template";
import {
  HeaderSection,
  PurposeSection,
  DesignSection,
  BenefitsSection,
} from "../../components/form/FormSections";
import { buildDefaultCanvasInitial } from "./_canvasInitial";

export const memoClassicTemplate: Template = {
  id: "memo-classic",
  name: "經典備忘",
  description: "純文字段落 + 簡單表格，最接近傳統工作週報格式。",
  defaultPaletteId: "minimal-mono",
  renderForm: ({ report, palette, readOnly }) => (
    <div
      className="course-report-form-root"
      style={{
        backgroundColor: palette.paper,
        color: palette.ink,
        padding: "48px 60px",
        minHeight: 800,
        fontFamily: "Times New Roman, 標楷體, serif",
      }}
    >
      <HeaderSection report={report} palette={palette} readOnly={readOnly} />
      <PurposeSection report={report} palette={palette} readOnly={readOnly} />
      <DesignSection report={report} palette={palette} readOnly={readOnly} />
      <BenefitsSection report={report} palette={palette} readOnly={readOnly} />
    </div>
  ),
  renderCanvasInitial: (report, palette) =>
    buildDefaultCanvasInitial(report, palette, {
      titleFontSize: 30,
      sectionBg: palette.ink,
    }),
};
