/**
 * 6 個模板的 TemplateStyle 規格表。
 * 改這裡會直接影響 EmailTemplate / EditableCanvas 的所有視覺呈現，
 * 是「模板差異化」的單一資料來源（single source of truth）。
 */

import type { TemplateStyle } from '@edm/types/template';
import { SERIF_TC_STACK, MONO_STACK } from '@edm/types/theme';

const DEFAULT_TC_STACK =
  '"Microsoft JhengHei", "微軟正黑體", "PingFang TC", "Noto Sans TC", sans-serif';

/**
 * 1. Classic — 經典商務
 * 沉穩、置中對稱、金色細線、襯線小裝飾、適合高層課程／公司商務發信
 */
const CLASSIC: TemplateStyle = {
  id: 'classic',
  name: '經典商務 Classic',
  description: '對稱版型 + 金色細線裝飾，沉穩可靠的商務感',
  recommendedPaletteId: 'navy-gold',
  hero: {
    variant: 'classic',
    titleSize: 34,
    subtitleSize: 14,
    imageHeight: 240,
    showAccentRule: true,
    titleWeight: 800,
    titleLetterSpacing: 0.02,
    useDisplayFont: false,
  },
  headline: {
    align: 'center',
    eyebrow: 'uppercase-line',
    weight: 700,
    letterSpacing: 0.01,
    showAccentRule: true,
    useDisplayFont: false,
    showSectionNumber: false,
  },
  divider: 'double-line',
  courseTable: 'classic',
  cta: {
    shape: 'rounded',
    radius: 4,
    weight: 700,
    letterSpacing: 0.05,
    paddingX: 36,
    paddingY: 14,
    uppercase: false,
  },
  section: { paddingY: 24, paddingX: 32, gapMultiplier: 1 },
  footer: { style: 'formal' },
  typography: {
    headingFont: DEFAULT_TC_STACK,
    bodyFont: DEFAULT_TC_STACK,
    accentFont: SERIF_TC_STACK,
    letterSpacing: { eyebrow: 0.22, heading: 0.01, body: 0 },
  },
};

/**
 * 2. Modern — 現代科技
 * 深底、霓虹漸層光暈、左對齊、大膽字體、適合 IT/AI/工程技術課程
 */
const MODERN: TemplateStyle = {
  id: 'modern',
  name: '現代科技 Modern',
  description: '深色底 + 霓虹光暈，俐落前衛',
  recommendedPaletteId: 'tech-neon',
  hero: {
    variant: 'modern',
    titleSize: 38,
    subtitleSize: 14,
    imageHeight: 260,
    showAccentRule: false,
    titleWeight: 800,
    titleLetterSpacing: -0.01,
    useDisplayFont: false,
  },
  headline: {
    align: 'left',
    eyebrow: 'pill',
    weight: 800,
    letterSpacing: -0.005,
    showAccentRule: false,
    useDisplayFont: false,
    showSectionNumber: false,
  },
  divider: 'gradient-bar',
  courseTable: 'card',
  cta: {
    shape: 'rounded',
    radius: 8,
    weight: 700,
    letterSpacing: 0.02,
    paddingX: 40,
    paddingY: 16,
    uppercase: false,
  },
  section: { paddingY: 28, paddingX: 32, gapMultiplier: 1.05 },
  footer: { style: 'accent' },
  decorations: [
    { position: 'hero-corner-blob', kind: 'gradient-blob' },
  ],
  typography: {
    headingFont: DEFAULT_TC_STACK,
    bodyFont: DEFAULT_TC_STACK,
    accentFont: MONO_STACK,
    letterSpacing: { eyebrow: 0.16, heading: -0.005, body: 0 },
  },
};

/**
 * 3. Minimal — 簡潔留白
 * 大量留白、細字標題、單色強調、適合高階課程或極簡品牌
 */
const MINIMAL: TemplateStyle = {
  id: 'minimal',
  name: '簡潔留白 Minimal',
  description: '極大留白 + 細字大標，沉靜留白美學',
  recommendedPaletteId: 'mono',
  hero: {
    variant: 'minimal',
    titleSize: 36,
    subtitleSize: 13,
    imageHeight: 180,
    showAccentRule: false,
    titleWeight: 300,
    titleLetterSpacing: 0,
    useDisplayFont: true,
  },
  headline: {
    align: 'left',
    eyebrow: 'uppercase',
    weight: 300,
    letterSpacing: 0,
    showAccentRule: false,
    useDisplayFont: true,
    showSectionNumber: false,
  },
  divider: 'thin-line',
  courseTable: 'minimal',
  cta: {
    shape: 'square',
    radius: 0,
    weight: 600,
    letterSpacing: 0.16,
    paddingX: 44,
    paddingY: 14,
    uppercase: true,
  },
  section: { paddingY: 36, paddingX: 40, gapMultiplier: 1.4 },
  footer: { style: 'minimal' },
  typography: {
    headingFont: DEFAULT_TC_STACK,
    bodyFont: DEFAULT_TC_STACK,
    displayFont: SERIF_TC_STACK,
    letterSpacing: { eyebrow: 0.32, heading: 0, body: 0 },
  },
};

/**
 * 4. Magazine — 雜誌風
 * 不對稱版型、襯線大字、章節編號、引言塊、適合創新／策展型課程
 */
const MAGAZINE: TemplateStyle = {
  id: 'magazine',
  name: '雜誌風 Magazine',
  description: '不對稱版型 + 襯線大標 + 章節編號，獨立刊物風格',
  recommendedPaletteId: 'morandi',
  hero: {
    variant: 'magazine',
    titleSize: 44,
    subtitleSize: 13,
    imageHeight: 220,
    showAccentRule: false,
    titleWeight: 700,
    titleLetterSpacing: -0.01,
    useDisplayFont: true,
  },
  headline: {
    align: 'left',
    eyebrow: 'issue',
    weight: 700,
    letterSpacing: -0.005,
    showAccentRule: false,
    useDisplayFont: true,
    showSectionNumber: true,
  },
  divider: 'serif-numeral',
  courseTable: 'minimal',
  cta: {
    shape: 'square',
    radius: 0,
    weight: 700,
    letterSpacing: 0.04,
    paddingX: 32,
    paddingY: 14,
    uppercase: false,
  },
  section: { paddingY: 32, paddingX: 36, gapMultiplier: 1.2 },
  footer: { style: 'minimal' },
  typography: {
    headingFont: SERIF_TC_STACK,
    bodyFont: DEFAULT_TC_STACK,
    displayFont: SERIF_TC_STACK,
    accentFont: SERIF_TC_STACK,
    letterSpacing: { eyebrow: 0.24, heading: -0.01, body: 0 },
  },
};

/**
 * 5. Academic — 學術正式
 * 頂部三色彩帶、表頭式 hero、紅色強調、雙線分隔、最像現有公文 EDM
 */
const ACADEMIC: TemplateStyle = {
  id: 'academic',
  name: '學術正式 Academic',
  description: '三色彩帶 + 公文表格，最像公司既有 EDM',
  recommendedPaletteId: 'academic-indigo',
  hero: {
    variant: 'academic',
    titleSize: 28,
    subtitleSize: 14,
    imageHeight: 200,
    showAccentRule: true,
    titleWeight: 800,
    titleLetterSpacing: 0.02,
    useDisplayFont: false,
  },
  headline: {
    align: 'center',
    eyebrow: 'formal',
    weight: 800,
    letterSpacing: 0.02,
    showAccentRule: true,
    useDisplayFont: false,
    showSectionNumber: false,
  },
  divider: 'double-line',
  courseTable: 'formal',
  cta: {
    shape: 'square',
    radius: 2,
    weight: 700,
    letterSpacing: 0.08,
    paddingX: 36,
    paddingY: 12,
    uppercase: false,
  },
  section: { paddingY: 22, paddingX: 32, gapMultiplier: 0.95 },
  footer: { style: 'formal' },
  decorations: [{ position: 'hero-top-stripe', kind: 'tri-color-band' }],
  typography: {
    headingFont: DEFAULT_TC_STACK,
    bodyFont: DEFAULT_TC_STACK,
    accentFont: SERIF_TC_STACK,
    letterSpacing: { eyebrow: 0.28, heading: 0.02, body: 0 },
  },
};

/**
 * 6. Vibrant — 活潑校園
 * 彩色斜切色塊、膠囊大標籤、波浪分隔、大圓角、適合輕鬆主題、新人課程
 */
const VIBRANT: TemplateStyle = {
  id: 'vibrant',
  name: '活潑校園 Vibrant',
  description: '彩色斜切 + 膠囊大標籤 + 波浪分隔，輕快好親近',
  recommendedPaletteId: 'sunrise',
  hero: {
    variant: 'vibrant',
    titleSize: 36,
    subtitleSize: 14,
    imageHeight: 240,
    showAccentRule: false,
    titleWeight: 900,
    titleLetterSpacing: -0.01,
    useDisplayFont: false,
  },
  headline: {
    align: 'left',
    eyebrow: 'pill',
    weight: 900,
    letterSpacing: -0.01,
    showAccentRule: false,
    useDisplayFont: false,
    showSectionNumber: false,
  },
  divider: 'wave',
  courseTable: 'banded',
  cta: {
    shape: 'pill',
    radius: 999,
    weight: 800,
    letterSpacing: 0.02,
    paddingX: 44,
    paddingY: 16,
    uppercase: false,
  },
  section: { paddingY: 26, paddingX: 32, gapMultiplier: 1 },
  footer: { style: 'accent' },
  decorations: [{ position: 'hero-side-shapes', kind: 'diagonal-blocks' }],
  typography: {
    headingFont: DEFAULT_TC_STACK,
    bodyFont: DEFAULT_TC_STACK,
    letterSpacing: { eyebrow: 0.14, heading: -0.01, body: 0 },
  },
};

// ============================================================================
// v0.6.0：6 個新模板（重用既有 6 個 hero variant，但 typography / spec /
// decorations / blueprint 全部不同，達成真正視覺差異）
// ============================================================================

/**
 * 7. Bulletin — 公告佈告
 * 重用 academic hero variant，但搭配「形式更急切」的版型：強調倒數時間 / 限額名額 /
 * 緊湊段距、formal eyebrow、tri-band divider，適合「報名截止前的最後通知」場景。
 */
const BULLETIN: TemplateStyle = {
  id: 'bulletin',
  name: '公告佈告 Bulletin',
  description: '頂部高亮警示帶 + 緊湊版型，適合限額 / 截止前通知',
  recommendedPaletteId: 'cht-brand',
  hero: {
    variant: 'academic',
    titleSize: 30,
    subtitleSize: 14,
    imageHeight: 160,
    showAccentRule: true,
    titleWeight: 800,
    titleLetterSpacing: 0.015,
    useDisplayFont: false,
  },
  headline: {
    align: 'left',
    eyebrow: 'formal',
    weight: 800,
    letterSpacing: 0.005,
    showAccentRule: true,
    useDisplayFont: false,
    showSectionNumber: false,
  },
  divider: 'tri-band',
  courseTable: 'banded',
  cta: {
    shape: 'square',
    radius: 2,
    weight: 800,
    letterSpacing: 0.06,
    paddingX: 36,
    paddingY: 14,
    uppercase: false,
  },
  // 緊湊：垂直留白比 academic 還少
  section: { paddingY: 18, paddingX: 28, gapMultiplier: 0.85 },
  footer: { style: 'formal' },
  decorations: [{ position: 'hero-top-stripe', kind: 'tri-color-band' }],
  typography: {
    headingFont: DEFAULT_TC_STACK,
    bodyFont: DEFAULT_TC_STACK,
    accentFont: MONO_STACK,
    letterSpacing: { eyebrow: 0.32, heading: 0.005, body: 0 },
  },
};

/**
 * 8. Gradient — 漸層流光
 * 重用 modern hero variant + 漸層 blob，但配色搭配 aurora（青綠 + 粉紫），
 * 主標較細、CTA 大圓角，整體柔和現代，適合 ESG / 永續 / 未來職涯。
 */
const GRADIENT: TemplateStyle = {
  id: 'gradient',
  name: '漸層流光 Gradient',
  description: '柔和漸層光暈 + 大圓角卡片，永續 / ESG / 創新主題',
  recommendedPaletteId: 'aurora',
  hero: {
    variant: 'modern',
    titleSize: 36,
    subtitleSize: 14,
    imageHeight: 240,
    showAccentRule: false,
    // 比 modern 細，更接近 minimal
    titleWeight: 600,
    titleLetterSpacing: -0.005,
    useDisplayFont: false,
  },
  headline: {
    align: 'left',
    eyebrow: 'pill',
    weight: 600,
    letterSpacing: -0.005,
    showAccentRule: false,
    useDisplayFont: false,
    showSectionNumber: false,
  },
  divider: 'gradient-bar',
  courseTable: 'card',
  cta: {
    shape: 'pill',
    radius: 999,
    weight: 600,
    letterSpacing: 0.01,
    paddingX: 44,
    paddingY: 16,
    uppercase: false,
  },
  section: { paddingY: 30, paddingX: 32, gapMultiplier: 1.15 },
  footer: { style: 'accent' },
  decorations: [{ position: 'hero-corner-blob', kind: 'gradient-blob' }],
  typography: {
    headingFont: DEFAULT_TC_STACK,
    bodyFont: DEFAULT_TC_STACK,
    accentFont: SERIF_TC_STACK,
    letterSpacing: { eyebrow: 0.18, heading: -0.005, body: 0.005 },
  },
};

/**
 * 9. Editorial — 編輯特輯
 * 重用 magazine hero variant + 重襯線字體，但搭配 ember（深底 + 朱紅）；
 * 比一般 magazine 更厚重、更有「主管刊物 / 領導力月刊」氣質。
 */
const EDITORIAL: TemplateStyle = {
  id: 'editorial',
  name: '編輯特輯 Editorial',
  description: '重襯線大標 + 朱紅 accent，高階主管 / 領導力課程',
  recommendedPaletteId: 'ember',
  hero: {
    variant: 'magazine',
    titleSize: 46,
    subtitleSize: 13,
    imageHeight: 240,
    showAccentRule: false,
    titleWeight: 800,
    titleLetterSpacing: -0.015,
    useDisplayFont: true,
  },
  headline: {
    align: 'left',
    eyebrow: 'issue',
    weight: 800,
    letterSpacing: -0.01,
    showAccentRule: true,
    useDisplayFont: true,
    showSectionNumber: true,
  },
  divider: 'serif-numeral',
  courseTable: 'minimal',
  cta: {
    shape: 'square',
    radius: 0,
    weight: 800,
    letterSpacing: 0.06,
    paddingX: 40,
    paddingY: 16,
    uppercase: true,
  },
  section: { paddingY: 36, paddingX: 40, gapMultiplier: 1.3 },
  footer: { style: 'minimal' },
  typography: {
    headingFont: SERIF_TC_STACK,
    bodyFont: SERIF_TC_STACK,
    displayFont: SERIF_TC_STACK,
    accentFont: MONO_STACK,
    letterSpacing: { eyebrow: 0.36, heading: -0.015, body: 0.005 },
  },
};

/**
 * 10. Paper — 紙本信箋
 * 重用 classic hero variant，但去掉滿版圖、改用米白底 + 細邊框包覆內容，
 * 搭配 morandi 配色與襯線字，適合人文 / 品德 / 傳統文化課程。
 */
const PAPER: TemplateStyle = {
  id: 'paper',
  name: '紙本信箋 Paper',
  description: '米白 + 細邊框 + 襯線字，人文 / 品德 / 傳統文化',
  recommendedPaletteId: 'morandi',
  hero: {
    variant: 'classic',
    titleSize: 30,
    subtitleSize: 13,
    imageHeight: 180,
    showAccentRule: true,
    titleWeight: 600,
    titleLetterSpacing: 0.005,
    useDisplayFont: true,
  },
  headline: {
    align: 'center',
    eyebrow: 'uppercase',
    weight: 500,
    letterSpacing: 0.02,
    showAccentRule: true,
    useDisplayFont: true,
    showSectionNumber: false,
  },
  divider: 'thin-line',
  courseTable: 'classic',
  cta: {
    shape: 'square',
    radius: 1,
    weight: 600,
    letterSpacing: 0.08,
    paddingX: 36,
    paddingY: 12,
    uppercase: false,
  },
  section: { paddingY: 28, paddingX: 36, gapMultiplier: 1.15 },
  footer: { style: 'minimal' },
  typography: {
    headingFont: SERIF_TC_STACK,
    bodyFont: SERIF_TC_STACK,
    displayFont: SERIF_TC_STACK,
    accentFont: SERIF_TC_STACK,
    letterSpacing: { eyebrow: 0.3, heading: 0.005, body: 0.01 },
  },
};

/**
 * 11. Kanban — 看板資訊
 * 重用 classic hero variant，但 courseTable 改 card 樣式（每堂課一張卡），
 * dotted divider，冷靜中性版型；適合 PMP / 敏捷 / 流程管理 / SOP 教學。
 */
const KANBAN: TemplateStyle = {
  id: 'kanban',
  name: '看板資訊 Kanban',
  description: '卡片式課表 + 點狀分隔，PMP / 敏捷 / 流程管理',
  recommendedPaletteId: 'cht-brand',
  hero: {
    variant: 'classic',
    titleSize: 32,
    subtitleSize: 14,
    imageHeight: 220,
    showAccentRule: false,
    titleWeight: 700,
    titleLetterSpacing: 0,
    useDisplayFont: false,
  },
  headline: {
    align: 'left',
    eyebrow: 'pill',
    weight: 700,
    letterSpacing: 0,
    showAccentRule: false,
    useDisplayFont: false,
    showSectionNumber: false,
  },
  divider: 'dots',
  courseTable: 'card',
  cta: {
    shape: 'rounded',
    radius: 6,
    weight: 700,
    letterSpacing: 0.01,
    paddingX: 40,
    paddingY: 14,
    uppercase: false,
  },
  section: { paddingY: 22, paddingX: 30, gapMultiplier: 1 },
  footer: { style: 'minimal' },
  typography: {
    headingFont: DEFAULT_TC_STACK,
    bodyFont: DEFAULT_TC_STACK,
    accentFont: MONO_STACK,
    letterSpacing: { eyebrow: 0.18, heading: 0, body: 0 },
  },
};

/**
 * 12. Poster — 海報視覺
 * 重用 vibrant hero variant，但配 tech-neon 暗色配色 + 巨大標題 + 全大寫 CTA，
 * 適合大型講座 / 跨部門論壇 / 年度大會這類「需要把標題喊很大聲」的場景。
 */
const POSTER: TemplateStyle = {
  id: 'poster',
  name: '海報視覺 Poster',
  description: '巨大主標 + 全大寫 CTA + 強烈色塊，大型講座 / 論壇',
  recommendedPaletteId: 'tech-neon',
  hero: {
    variant: 'vibrant',
    titleSize: 50,
    subtitleSize: 14,
    imageHeight: 260,
    showAccentRule: false,
    titleWeight: 900,
    titleLetterSpacing: -0.025,
    useDisplayFont: false,
  },
  headline: {
    align: 'left',
    eyebrow: 'pill',
    weight: 900,
    letterSpacing: -0.015,
    showAccentRule: false,
    useDisplayFont: false,
    showSectionNumber: false,
  },
  divider: 'wave',
  courseTable: 'banded',
  cta: {
    shape: 'pill',
    radius: 999,
    weight: 900,
    letterSpacing: 0.16,
    paddingX: 48,
    paddingY: 18,
    uppercase: true,
  },
  // 區塊間呼吸距離大，營造海報「視覺停頓」感
  section: { paddingY: 30, paddingX: 32, gapMultiplier: 1.25 },
  footer: { style: 'accent' },
  decorations: [
    { position: 'hero-side-shapes', kind: 'diagonal-blocks' },
    { position: 'hero-corner-blob', kind: 'gradient-blob' },
  ],
  typography: {
    headingFont: DEFAULT_TC_STACK,
    bodyFont: DEFAULT_TC_STACK,
    letterSpacing: { eyebrow: 0.2, heading: -0.025, body: 0 },
  },
};

export const TEMPLATE_STYLES: Record<string, TemplateStyle> = {
  classic: CLASSIC,
  modern: MODERN,
  minimal: MINIMAL,
  magazine: MAGAZINE,
  academic: ACADEMIC,
  vibrant: VIBRANT,
  // v0.6.0
  bulletin: BULLETIN,
  gradient: GRADIENT,
  editorial: EDITORIAL,
  paper: PAPER,
  kanban: KANBAN,
  poster: POSTER,
};

export const TEMPLATE_STYLE_LIST: TemplateStyle[] = [
  CLASSIC,
  MODERN,
  MINIMAL,
  MAGAZINE,
  ACADEMIC,
  VIBRANT,
  // v0.6.0
  BULLETIN,
  GRADIENT,
  EDITORIAL,
  PAPER,
  KANBAN,
  POSTER,
];

export function getTemplateStyle(id: string): TemplateStyle {
  return TEMPLATE_STYLES[id] ?? CLASSIC;
}
