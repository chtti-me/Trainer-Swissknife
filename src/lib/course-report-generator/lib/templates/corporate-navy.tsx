/**
 * 【模板：corporate-navy】
 * 中華電信深藍 + 白，仿傳統公文，給長官最熟悉的格式。
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

export const corporateNavyTemplate: Template = {
  id: "corporate-navy",
  name: "公文風藍",
  description: "中華電信深藍 + 白，仿傳統公文格式，正式典雅。",
  defaultPaletteId: "navy-white",
  renderForm: ({ report, palette, readOnly }) => (
    <div
      className="course-report-form-root"
      style={{
        backgroundColor: palette.paper,
        color: palette.ink,
        padding: "40px 50px",
        minHeight: 800,
        fontFamily: "DFKai-SB, BiauKai, 標楷體, serif",
      }}
    >
      <div
        className="mb-6 border-b-4 pb-4 text-center"
        style={{ borderColor: palette.primary }}
      >
        <div className="text-sm tracking-wider" style={{ color: palette.accent }}>
          中華電信學院
        </div>
        <div className="mt-1 text-xs" style={{ color: palette.ink }}>
          Chunghwa Telecom Teaching Institute
        </div>
      </div>
      <HeaderSection report={report} palette={palette} readOnly={readOnly} />
      <div className="my-4 border-t-2" style={{ borderColor: palette.primary }} />
      <PurposeSection report={report} palette={palette} readOnly={readOnly} />
      <DesignSection report={report} palette={palette} readOnly={readOnly} />
      <BenefitsSection report={report} palette={palette} readOnly={readOnly} />
    </div>
  ),
  renderCanvasInitial: (report, palette) =>
    buildDefaultCanvasInitial(report, palette, {
      titleFontSize: 32,
      sectionBg: palette.primary,
    }),
};
