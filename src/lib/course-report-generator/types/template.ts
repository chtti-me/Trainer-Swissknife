/**
 * 【課程規劃報告產生器 - 模板與配色型別】
 */
import type { ReactNode } from "react";
import type { CanvasBlock, CourseReport } from "./report";

export interface Palette {
  id: string;
  name: string;
  /** 主視覺色，用在標題/標頭背景 */
  primary: string;
  /** 主視覺色上的文字色 */
  primaryFg: string;
  /** 次要強調色，用在副標、bullet */
  accent: string;
  /** 主要內文色 */
  ink: string;
  /** 內文背景 */
  paper: string;
  /** 邊框與分隔線 */
  border: string;
  /** Section 標題背景 */
  sectionBg: string;
  /** 表格表頭背景 */
  tableHeaderBg: string;
  /** 表格表頭文字 */
  tableHeaderFg: string;
  /** 表格框線 */
  tableBorder: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  /** 推薦搭配的配色 ID（使用者可換） */
  defaultPaletteId: string;
  /**
   * 渲染制式表單模式視圖。
   * 由模板自行決定排版、字型、是否帶 header 圖、是否分頁等。
   */
  renderForm: (props: TemplateRenderProps) => ReactNode;
  /**
   * 切到「自由畫布模式」時，提供初始的 canvas blocks（依照表單資料 + 模板版型）。
   * 使用者可繼續拖曳/編輯。
   */
  renderCanvasInitial: (report: CourseReport, palette: Palette) => CanvasBlock[];
}

export interface TemplateRenderProps {
  report: CourseReport;
  palette: Palette;
  /** 是否唯讀（用於匯出時靜態渲染） */
  readOnly?: boolean;
  /** 編輯回呼（form 模式提供，readOnly=true 時不傳） */
  onChange?: (patch: Partial<CourseReport>) => void;
}
