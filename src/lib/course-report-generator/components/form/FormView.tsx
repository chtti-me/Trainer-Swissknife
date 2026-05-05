"use client";

/**
 * 【課程規劃報告產生器 - 制式表單視圖】
 *
 * 取得目前模板與配色，呼叫 template.renderForm({ report, palette, readOnly }) 渲染。
 * 外層用一個固定寬度容器（A4 寬約 794px / Slide 寬 1280px），方便匯出時擷取。
 */
import * as React from "react";
import { useReportStore } from "../../store/reportStore";
import { getTemplate } from "../../lib/templates";
import { getPalette } from "../../lib/palettes";

interface Props {
  /** 為 true 時關閉編輯（用於匯出時擷取畫面） */
  readOnly?: boolean;
  /** 為匯出 PNG/PDF 用，設定 stage 寬度。預設 1024。 */
  stageWidth?: number;
}

export const FormView = React.forwardRef<HTMLDivElement, Props>(function FormView(
  { readOnly, stageWidth = 1024 },
  ref
) {
  const report = useReportStore((s) => s.report);
  const template = React.useMemo(() => getTemplate(report.templateId), [report.templateId]);
  const palette = React.useMemo(() => getPalette(report.paletteId), [report.paletteId]);

  return (
    <div
      ref={ref}
      data-export-root="course-report-form"
      style={{
        width: stageWidth,
        margin: "0 auto",
        backgroundColor: palette.paper,
        color: palette.ink,
        // 讓內部 Tailwind 的 text-muted-foreground 等元件不至於變成暗色背景下的白字，
        // 我們用 color-scheme: light 強制 form 控制項走「淺色介面」配色（input 預設黑字白底）
        colorScheme: "light",
      }}
      className="course-report-stage shadow-lg"
    >
      {template.renderForm({ report, palette, readOnly })}
    </div>
  );
});
