/**
 * v0.5.3：edm-core barrel —— 與 React / Electron 無關的純函式 / 型別。
 *
 * 對宿主應用（瑞士刀 / 純 Node 後端）的承諾：
 *   - 這個 barrel 內所有東西都是 framework-agnostic
 *   - 不會 import 任何 React / DOM / Electron / Zustand / 圖庫
 *   - 可以在 Next.js Server Component、Edge runtime、Workers 等地方安全使用
 *
 * 用途：
 *   - 後端串接 AI 直連（generateCopy / generateImage 走自己的 server adapter）
 *   - 後端 SSR EDM HTML（renderEdmHtml）
 *   - 後端依 plan 產出 blocks 預覽（buildBlocksForTemplate）
 */

// ──────────────── Types ────────────────
export type {
  ClassPlan,
} from '@edm/types/classPlan';
export { emptyClassPlan } from '@edm/types/classPlan';

export type {
  Block,
  BlockBase,
  BlockType,
  BlockOrigin,
  HeroBlock,
  HeadlineBlock,
  CopyBlock,
  CourseTableBlock,
  InstructorBlock,
  CtaBlock,
  ImageBlock,
  DividerBlock,
  SpacerBlock,
  FooterBlock,
  ClassDateBlock,
  ClassTimeBlock,
  // v0.7.3：CTA / Headline 細粒度型別
  CtaStyleVariant,
  CtaRadiusPreset,
  CtaShadowLevel,
  HeadlineEffect,
} from '@edm/types/blocks';

export type {
  ColorTokens,
  Typography,
  Palette,
} from '@edm/types/theme';
export { defaultTypography } from '@edm/types/theme';

export type {
  GeneratedCopy,
  CopyTone,
} from '@edm/types/copy';
export {
  TONE_LABELS,
  TONE_HINTS,
} from '@edm/types/copy';

export type {
  HeroVariant,
  TemplateStyle,
} from '@edm/types/template';

export type { SavedModule } from '@edm/types/savedModule';

// ──────────────── AI（adapter 抽象）────────────────
export type {
  AiAdapter,
  AiJsonSchema,
  AiUserPart,
  AiGenerateTextOpts,
  AiGenerateImageOpts,
  AiGenerateTextResult,
  AiGenerateImageResult,
} from '@edm/lib/ai/adapter';
export { AiAdapterNotReadyError } from '@edm/lib/ai/adapter';

export {
  getAiAdapter,
  setAiAdapter,
  _resetAiAdapter,
} from '@edm/lib/ai/registry';

export {
  generateCopy,
  buildSystemPrompt,
} from '@edm/lib/ai/generateCopy';
export type { GenerateCopyOpts } from '@edm/lib/ai/generateCopy';

export {
  generateImage,
  buildImagePrompt,
} from '@edm/lib/ai/generateImage';
export type {
  GenerateImageOpts,
  ImageStyle,
  ImageRatio,
  GeneratedImage,
} from '@edm/lib/ai/generateImage';

export { parseClassPlan } from '@edm/lib/ai/parseClassPlan';
export { autoLayout } from '@edm/lib/ai/autoLayout';
export { isAiAdapterReady, hasGeminiKey } from '@edm/lib/ai/client';

// ──────────────── Settings adapter ────────────────
export type { SettingsAdapter } from '@edm/lib/settings/adapter';
export { NoopSettingsAdapter } from '@edm/lib/settings/adapter';
export {
  getSettingsAdapter,
  setSettingsAdapter,
  _resetSettingsAdapter,
} from '@edm/lib/settings/registry';

// ──────────────── Templates / Palettes ────────────────
export {
  TEMPLATES,
  buildBlocksForTemplate,
} from '@edm/lib/templates';
export { getTemplateStyle } from '@edm/lib/templates/styles';
export {
  PALETTE_PRESETS,
  getPaletteById,
} from '@edm/lib/palettes/presets';

// ──────────────── HTML render（給 server-side EDM 預覽用） ────────────────
export { renderEdmHtml } from '@edm/lib/email/render';
export type { EmailTemplateProps } from '@edm/lib/email/EmailTemplate';

// ──────────────── Host integration types ────────────────
export type { HostConfig } from '@edm/lib/host/types';
