/**
 * 【模板：minimal-mono】
 * 黑白極簡學術風，適合給資深長官或學術簡報。
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

export const minimalMonoTemplate: Template = {
  id: "minimal-mono",
  name: "極簡黑白",
  description: "極簡無裝飾、強對比、學術論文感。",
  defaultPaletteId: "minimal-mono",
  renderForm: ({ report, palette, readOnly }) => (
    <div
      className="course-report-form-root"
      style={{
        backgroundColor: palette.paper,
        color: palette.ink,
        padding: "48px 60px",
        minHeight: 800,
        fontFamily: "Helvetica Neue, Arial, sans-serif",
      }}
    >
      <HeaderSection report={report} palette={palette} readOnly={readOnly} />
      <div className="my-6 h-[2px]" style={{ backgroundColor: palette.ink }} />
      <PurposeSection report={report} palette={palette} readOnly={readOnly} />
      <DesignSection report={report} palette={palette} readOnly={readOnly} />
      <BenefitsSection report={report} palette={palette} readOnly={readOnly} />
    </div>
  ),
  renderCanvasInitial: (report, palette) =>
    buildDefaultCanvasInitial(report, palette, {
      titleFontSize: 34,
      sectionBg: palette.ink,
    }),
};
