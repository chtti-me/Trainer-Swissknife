/**
 * 【模板：vibrant-highlight】
 * 彩色強調框 + emoji icon，活潑亮眼，適合對外或新型課程。
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

export const vibrantHighlightTemplate: Template = {
  id: "vibrant-highlight",
  name: "亮眼強調",
  description: "彩色框與 emoji 點綴，活潑突顯課程特色。",
  defaultPaletteId: "vibrant-magenta",
  renderForm: ({ report, palette, readOnly }) => (
    <div
      className="course-report-form-root rounded-2xl"
      style={{
        backgroundColor: palette.paper,
        color: palette.ink,
        padding: "32px 36px",
        minHeight: 800,
        backgroundImage: `radial-gradient(circle at top right, ${palette.sectionBg} 0%, transparent 60%)`,
        border: `2px solid ${palette.accent}`,
      }}
    >
      <div
        className="mb-4 inline-block rounded-full px-4 py-1 text-xs font-bold tracking-wider"
        style={{
          backgroundColor: palette.accent,
          color: "#fff",
        }}
      >
        ✨ COURSE REPORT
      </div>
      <HeaderSection report={report} palette={palette} readOnly={readOnly} />
      <div className="my-3" />
      <PurposeSection report={report} palette={palette} readOnly={readOnly} />
      <DesignSection report={report} palette={palette} readOnly={readOnly} />
      <BenefitsSection report={report} palette={palette} readOnly={readOnly} />
    </div>
  ),
  renderCanvasInitial: (report, palette) =>
    buildDefaultCanvasInitial(report, palette, {
      titleFontSize: 40,
      sectionBg: palette.accent,
    }),
};
