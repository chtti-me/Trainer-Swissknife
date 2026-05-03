/**
 * 配色與排版型別。
 * v0.2 起：在原有 8 個扁平 token 之上增加可選的「色階」與更細的排版控制，
 *         舊資料仍 100% 相容（新欄位皆為 optional）。
 */

export interface ColorTokens {
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
}

/** 同一色相的 50→900 十階階梯（用於精緻設計：淺底 callout、深色按鈕等） */
export interface ColorScale {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
}

export interface Palette {
  id: string;
  name: string;
  description: string;
  tokens: ColorTokens;
}

/** 字重等級，沿用 CSS font-weight 100~900 慣例 */
export interface FontWeightScale {
  light: number;
  regular: number;
  medium: number;
  bold: number;
  black: number;
}

/** 字距（letter-spacing），單位皆為 em（負值代表更緊） */
export interface LetterSpacingScale {
  /** 小型大寫 eyebrow / 標籤 */
  eyebrow: number;
  /** 大標 / display */
  heading: number;
  /** 內文 */
  body: number;
}

export interface Typography {
  /** 主要英文/中文 heading 字體 stack */
  headingFont: string;
  /** 內文字體 stack */
  bodyFont: string;
  /** Display / 巨型大標字體（可選；未設定時 fallback 至 headingFont） */
  displayFont?: string;
  /** 引言、特殊裝飾用襯線/手寫字體（可選） */
  accentFont?: string;
  /** 內文基準字級（px） */
  baseSize: number;
  /** 字重等級（可選；未設定時用合理預設） */
  weight?: FontWeightScale;
  /** 字距等級（可選） */
  letterSpacing?: LetterSpacingScale;
  /** 行距倍率（可選） */
  lineHeight?: {
    tight: number;
    body: number;
    relaxed: number;
  };
}

export const defaultTypography: Typography = {
  headingFont:
    '"Microsoft JhengHei", "微軟正黑體", "PingFang TC", "Noto Sans TC", sans-serif',
  bodyFont:
    '"Microsoft JhengHei", "微軟正黑體", "PingFang TC", "Noto Sans TC", sans-serif',
  baseSize: 15,
  weight: { light: 300, regular: 400, medium: 600, bold: 700, black: 900 },
  letterSpacing: { eyebrow: 0.18, heading: 0, body: 0 },
  lineHeight: { tight: 1.2, body: 1.7, relaxed: 1.85 },
};

/** 標楷體 / serif 中文字體 stack（雜誌、學術風用） */
export const SERIF_TC_STACK =
  '"Source Han Serif TC", "Noto Serif TC", "PMingLiU", "新細明體", "Times New Roman", serif';

/** 等寬中文/英文字體 stack（modern 模板的小細節用） */
export const MONO_STACK =
  '"JetBrains Mono", "Fira Code", "Source Han Mono", "Microsoft JhengHei", monospace';
