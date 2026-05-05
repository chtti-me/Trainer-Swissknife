/**
 * 【模板：modern-card】
 * 卡片式風格，跳脫陽春報告，搭配漸層 header bar、圓角區塊。
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

export const modernCardTemplate: Template = {
  id: "modern-card",
  name: "現代卡片",
  description: "圓角區塊 + 漸層 header，給長官耳目一新的視覺。",
  defaultPaletteId: "navy-white",
  renderForm: ({ report, palette, readOnly }) => (
    <div
      className="course-report-form-root rounded-xl border shadow-sm"
      style={{
        background: `linear-gradient(180deg, ${palette.paper} 0%, ${palette.sectionBg} 100%)`,
        color: palette.ink,
        borderColor: palette.border,
        padding: "32px 36px",
        minHeight: 800,
      }}
    >
      <div
        className="mb-5 rounded-lg p-1"
        style={{
          background: `linear-gradient(90deg, ${palette.primary}, ${palette.accent})`,
        }}
      >
        <div className="rounded-md bg-card p-4" style={{ backgroundColor: palette.paper }}>
          <HeaderSection report={report} palette={palette} readOnly={readOnly} />
        </div>
      </div>
      <PurposeSection report={report} palette={palette} readOnly={readOnly} />
      <DesignSection report={report} palette={palette} readOnly={readOnly} />
      <BenefitsSection report={report} palette={palette} readOnly={readOnly} />
    </div>
  ),
  renderCanvasInitial: (report, palette) =>
    buildDefaultCanvasInitial(report, palette, {
      withColorBlock: true,
      titleFontSize: 38,
    }),
};
