/**
 * 模板「視覺規格」：每個 templateId 都對應一個 TemplateStyle，
 * 用來控制 BlockRenderer 的視覺決策（hero variant、字距、CTA 圓角、裝飾元素…）。
 *
 * 設計準則：
 * - 所有變化都「Outlook 友善」：用巢狀 table、ghost table、預先算好的色塊呈現，
 *   不依賴 flex/grid/CSS 變數。
 * - 裝飾性元素（gradient blob、SVG 波浪等）以 progressive enhancement 呈現：
 *   現代客戶端看得到、Outlook 看到實心色背景做為合理 fallback。
 */

import type { Typography } from './theme';

export type HeroVariant =
  /** 全寬照片 + 底部色塊容納標題 */
  | 'classic'
  /** 深色科技風：背景圖滿版 + 漸層光暈 + 白色大字疊加 */
  | 'modern'
  /** 雜誌風：左圖右文不對稱版型，含巨型 issue 編號 */
  | 'magazine'
  /** 極簡：沒有大圖、超大留白、細字置中 */
  | 'minimal'
  /** 學術公文：頂部三色彩帶 + 表頭式班代號欄位 */
  | 'academic'
  /** 活潑校園：彩色斜切色塊 + 大標籤 */
  | 'vibrant';

export type EyebrowStyle =
  /** 大寫字 + 細色線：「· COURSE PROGRAM ·」 */
  | 'uppercase-line'
  /** 純大寫字 + 字距 */
  | 'uppercase'
  /** 圓角彩色膠囊標籤 */
  | 'pill'
  /** 學術公文「公告 / NOTICE」風 */
  | 'formal'
  /** 雜誌期數 ISSUE 風 */
  | 'issue'
  /** 不顯示 */
  | 'none';

export type DividerVariant =
  | 'thin-line'
  | 'double-line'
  | 'gradient-bar'
  | 'wave'
  | 'dots'
  | 'serif-numeral'
  | 'tri-band';

export type CourseTableStyle =
  /** 經典直線格線（白底 + 細邊框） */
  | 'classic'
  /** 隔行斑馬條紋 */
  | 'banded'
  /** 每課一張卡（圓角 + 陰影模擬） */
  | 'card'
  /** 純文字、僅以細線分隔 */
  | 'minimal'
  /** 公文表格樣式（深色標頭、紅色強調） */
  | 'formal';

export type CtaShape =
  /** 直角 */
  | 'square'
  /** 小圓角 */
  | 'rounded'
  /** 大圓角（半圓兩端） */
  | 'pill';

export interface DecorationSpec {
  /** 裝飾元素相對位置 */
  position:
    | 'hero-top-stripe'      // hero 上緣彩色色帶
    | 'hero-corner-blob'     // hero 角落漸層光暈
    | 'hero-side-shapes'     // hero 邊緣幾何形狀
    | 'section-side-bar'     // section 左側裝飾條
    | 'footer-divider';      // 頁尾上緣裝飾分隔
  /** 裝飾類型 */
  kind:
    | 'gradient-blob'        // 漸層圓
    | 'tri-color-band'       // 三色彩帶（學術）
    | 'diagonal-blocks'      // 斜切色塊（活潑）
    | 'dot-grid'             // 點陣
    | 'corner-frame';        // 邊框角
}

export interface HeroSpec {
  variant: HeroVariant;
  /** 主標字級（px） */
  titleSize: number;
  /** 副標字級（px） */
  subtitleSize: number;
  /** 預設圖片高度（變體不同數值不同） */
  imageHeight: number;
  /** 主標下方是否顯示分隔線 */
  showAccentRule: boolean;
  /** 主標字重 */
  titleWeight: number;
  /** 主標字距（em） */
  titleLetterSpacing: number;
  /** 主標是否使用 displayFont（雜誌、簡約風用得到） */
  useDisplayFont: boolean;
}

export interface HeadlineSpec {
  /** 預設對齊 */
  align: 'left' | 'center';
  /** eyebrow 視覺風格 */
  eyebrow: EyebrowStyle;
  /** 主標字重 */
  weight: number;
  /** 主標字距（em） */
  letterSpacing: number;
  /** 主標下方是否使用 accent rule（短線分隔） */
  showAccentRule: boolean;
  /** 是否使用 displayFont */
  useDisplayFont: boolean;
  /** 雜誌風的章節編號（01、02…） */
  showSectionNumber: boolean;
}

export interface SectionSpec {
  /** 一般 section 上下 padding（px） */
  paddingY: number;
  /** 一般 section 左右 padding（px） */
  paddingX: number;
  /** 章節之間的「呼吸距離」倍率 */
  gapMultiplier: number;
}

export interface CtaSpec {
  shape: CtaShape;
  /** 圓角半徑（square 時忽略） */
  radius: number;
  /** 字重 */
  weight: number;
  /** 字距（em） */
  letterSpacing: number;
  /** 內距 X */
  paddingX: number;
  /** 內距 Y */
  paddingY: number;
  /** 是否大寫 */
  uppercase: boolean;
}

export interface FooterSpec {
  /** 頁尾風格：minimal=細線單行、formal=雙線+發文字號、accent=彩色色帶 */
  style: 'minimal' | 'formal' | 'accent';
}

export interface TemplateStyle {
  id: string;
  name: string;
  description: string;
  /** 對應推薦 paletteId，使用者可手動換配色 */
  recommendedPaletteId: string;

  hero: HeroSpec;
  headline: HeadlineSpec;
  divider: DividerVariant;
  courseTable: CourseTableStyle;
  cta: CtaSpec;
  section: SectionSpec;
  footer: FooterSpec;

  /** 此模板獨有的裝飾元素（依序疊加） */
  decorations?: DecorationSpec[];

  /** 此模板的 typography 偏好（會在切換時 merge 進 store） */
  typography: Partial<Typography>;
}
