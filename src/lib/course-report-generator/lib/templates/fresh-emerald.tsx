/**
 * 【模板：fresh-emerald】
 * 翠綠清新版面，適合培訓成果或永續類課程。
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

export const freshEmeraldTemplate: Template = {
  id: "fresh-emerald",
  name: "翠綠清新",
  description: "草綠色調 + 圓潤邊框，給人清新成長感。",
  defaultPaletteId: "emerald-fresh",
  renderForm: ({ report, palette, readOnly }) => (
    <div
      className="course-report-form-root rounded-xl"
      style={{
        backgroundColor: palette.paper,
        color: palette.ink,
        padding: "32px 36px",
        minHeight: 800,
        border: `1px solid ${palette.border}`,
        boxShadow: `0 4px 12px ${palette.sectionBg}`,
      }}
    >
      <div
        className="mb-6 -mx-9 -mt-8 rounded-t-xl px-9 py-6"
        style={{
          background: `linear-gradient(135deg, ${palette.primary} 0%, ${palette.accent} 100%)`,
          color: palette.primaryFg,
        }}
      >
        <div className="text-xs font-semibold tracking-widest opacity-80">課程規劃報告</div>
        <div className="mt-1 text-2xl font-bold">{report.title || "（未命名課程規劃）"}</div>
        {report.subtitle && <div className="mt-1 text-sm opacity-90">{report.subtitle}</div>}
      </div>
      <HeaderSection report={report} palette={palette} readOnly={readOnly} />
      <PurposeSection report={report} palette={palette} readOnly={readOnly} />
      <DesignSection report={report} palette={palette} readOnly={readOnly} />
      <BenefitsSection report={report} palette={palette} readOnly={readOnly} />
    </div>
  ),
  renderCanvasInitial: (report, palette) =>
    buildDefaultCanvasInitial(report, palette, {
      withColorBlock: true,
      titleFontSize: 36,
    }),
};
