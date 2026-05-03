/**
 * CTA 顏色計算純函式（v0.4.2.3 起；v0.7.3 大幅擴充）
 *
 * 用途：把 CTA 按鈕的 background / foreground / border / shadow / radius 計算邏輯抽出，
 * 讓 **編輯端（EditableCanvas.tsx）** 與 **預覽端（EmailTemplate.tsx）** 共用同一份來源，
 * 避免兩端各自實作而失對稱（v0.4.2.2 修好預覽，但編輯漏修，造成「編輯沒變預覽有變」）。
 *
 * ## v0.7.3 升級重點
 *
 * 新增三種 style 變體：
 *   - `gradient`：bg 為 linear-gradient(135deg, gradientFrom, gradientTo)；
 *     未指定 from/to 時 fallback 到 `tokens.primary` → `tokens.accent`；
 *     `solidFallback` 提供 Outlook desktop（不支援 background-image）的退化色。
 *   - `ghost`：bg 用 `mixHex(primary, surface, 0.12)` —— 12% primary 疊在 surface 上，
 *     不依賴 rgba（Outlook 不支援），保證所有客戶端都顯示一致的「淡淡 primary 背景」。
 *   - `soft`：bg 用 `mixHex(primary, surface, 0.18)` —— 比 ghost 飽和度高一點，仍是實心 hex。
 *
 * 新增三個 helper：
 *   - `getCtaShadowCss(level)`：把 `'sm'|'md'|'lg'` 轉成實際 box-shadow CSS
 *   - `getCtaRadiusPx(preset, fallback)`：把 `'pill'|'lg'|...` preset 轉成 px（pill 用 999）
 *   - `getCtaBackground(...)`：拆出 background 的多型計算（含 gradient / Outlook fallback）
 *
 * ## 規則 (v0.7.3 完整版)
 *   - **背景色（bg / backgroundImage）**：
 *       primary  → bg = tokens.primary，無 backgroundImage
 *       outline  → bg = transparent
 *       gradient → bg = solidFallback，backgroundImage = linear-gradient(...)
 *       ghost    → bg = mixHex(primary, surface, 0.12)
 *       soft     → bg = mixHex(primary, surface, 0.18)
 *   - **文字色（fg）優先序**：
 *       1. block.tokensOverride.textPrimary（且 style === primary）→ 使用該覆寫值
 *       2. primary / gradient → readableOn(主色)；其餘 → tokens.primary
 *   - **邊框（border）**：outline → `2px solid primary`；其他 → `none`
 *
 * ## 為什麼 fg 要看 `block.tokensOverride.textPrimary` 而不是 `tokens.textPrimary`?
 *
 * 因為 caller 通常會先做 `mergedTokens = { ...globalTokens, ...block.tokensOverride }`
 * 把 override merge 進來，再把 mergedTokens 傳進這個函式。此時 `tokens.textPrimary`
 * **永遠**有值（沒覆寫時是全域值），無法判斷「使用者是否明確覆寫了」。
 *
 * 所以 caller 必須**同時傳 block 與 mergedTokens**，這樣我們才能從 `block.tokensOverride`
 * 讀「own property」判斷「明確覆寫」。
 */
import type { CtaBlock, CtaRadiusPreset, CtaShadowLevel } from '@edm/types/blocks';
import type { ColorTokens } from '@edm/types/theme';
import { mixHex, readableOn } from '@edm/lib/theme/colorScale';

export interface CtaColors {
  /** 按鈕背景色（CSS color；gradient 樣式時是 Outlook fallback 用的實心色） */
  bg: string;
  /**
   * 漸層 background-image（CSS string，例：`linear-gradient(135deg, #FF6B35, #F7931E)`）。
   * 只有 style === 'gradient' 才會有值；其他 style 都是 null。
   *
   * 渲染端 inline 同時設 `background: bg` 與 `backgroundImage: gradientCss`：
   *   - 支援 gradient 的客戶端會顯示漸層
   *   - Outlook desktop 不支援 background-image → 退化為 bg 實心色
   */
  gradientCss: string | null;
  /** 按鈕文字色（CSS color） */
  fg: string;
  /** 按鈕 border 完整 CSS（包含寬度+樣式+色） */
  border: string;
  /** outline 樣式時的 border 色（其他樣式為 null） */
  borderColor: string | null;
  /** 偵錯用：fg 是否來自使用者明確覆寫 */
  fgFromOverride: boolean;
}

/**
 * 計算 CTA 按鈕的色彩多元組（bg / gradient / fg / border）。
 *
 * @param block 目標 CtaBlock（會看 block.tokensOverride 判斷明確覆寫；style 影響 bg 計算）
 * @param tokens **已 merge 過 override** 的 ColorTokens（caller 負責 merge）
 */
export function computeCtaColors(block: CtaBlock, tokens: ColorTokens): CtaColors {
  const isPrimary = block.style === 'primary';
  const isOutline = block.style === 'outline';
  const isGradient = block.style === 'gradient';
  const isGhost = block.style === 'ghost';
  const isSoft = block.style === 'soft';

  // ── 計算 bg / gradientCss ───────────────────────────────────────
  let bg: string;
  let gradientCss: string | null = null;

  if (isPrimary) {
    bg = tokens.primary;
  } else if (isOutline) {
    bg = 'transparent';
  } else if (isGradient) {
    const from = block.gradientFrom || tokens.primary;
    const to = block.gradientTo || tokens.accent;
    gradientCss = `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
    // Outlook fallback：用兩色的中間色當實心 bg（讓不支援 gradient 的客戶端看到接近的顏色）
    bg = mixHex(from, to, 0.5);
  } else if (isGhost) {
    bg = mixHex(tokens.primary, tokens.surface, 0.12);
  } else if (isSoft) {
    bg = mixHex(tokens.primary, tokens.surface, 0.18);
  } else {
    bg = tokens.primary; // fallback：未來新增的 style 預設為實心
  }

  // ── 計算 fg ────────────────────────────────────────────────────
  // 「明確覆寫」判斷：必須是 primary 樣式（其他樣式 fg 用的都是 tokens.primary 或 readableOn(主色)，那邊已經會吃 override）
  // 而且必須在 block.tokensOverride 上是 own property（單純 tokens.textPrimary 永遠有值，無法判斷）
  const fgFromOverride =
    isPrimary
    && !!block.tokensOverride
    && Object.prototype.hasOwnProperty.call(block.tokensOverride, 'textPrimary');

  let fg: string;
  if (fgFromOverride) {
    fg = block.tokensOverride!.textPrimary as string;
  } else if (isPrimary) {
    fg = readableOn(tokens.primary);
  } else if (isGradient) {
    // gradient bg 不易讀，用兩色中間色判斷亮度比較穩
    fg = readableOn(bg);
  } else {
    // outline / ghost / soft：文字色都用 primary
    fg = tokens.primary;
  }

  // ── 計算 border ────────────────────────────────────────────────
  const borderColor = isOutline ? tokens.primary : null;
  const border = borderColor ? `2px solid ${borderColor}` : 'none';

  return { bg, gradientCss, fg, border, borderColor, fgFromOverride };
}

/**
 * 把圓角 preset 轉成 px。
 *
 * - `inherit`：回傳 `fallback`（通常是 `style.cta.radius`，由模板提供）
 * - `square`：0
 * - `sm` / `md` / `lg`：4 / 8 / 16
 * - `pill`：999（足夠把任何高度的按鈕變成全圓角）
 *
 * @param preset block-level 的圓角設定
 * @param fallback 模板預設值（preset 為 `inherit` 或 undefined 時使用）
 */
export function getCtaRadiusPx(
  preset: CtaRadiusPreset | undefined,
  fallback: number,
): number {
  if (!preset || preset === 'inherit') return fallback;
  switch (preset) {
    case 'square':
      return 0;
    case 'sm':
      return 4;
    case 'md':
      return 8;
    case 'lg':
      return 16;
    case 'pill':
      return 999;
  }
}

/**
 * 把 shadow level 轉成 box-shadow CSS string。
 *
 * 原則：用「軟而中性」的陰影（黑色帶 alpha）+ 距離往下偏，模擬「按鈕浮起」感。
 * 信件客戶端對 box-shadow 的支援：
 *   - Apple Mail / iOS / Gmail web / Outlook web：✅
 *   - Outlook desktop（Windows）：❌ 整個 box-shadow 屬性會被忽略
 * 因此這層完全是「漸進增強」，不會破壞排版。
 *
 * @param level 'none' | 'sm' | 'md' | 'lg'
 * @returns CSS box-shadow value，'none' 時回傳 'none'
 */
export function getCtaShadowCss(level: CtaShadowLevel | undefined): string {
  switch (level) {
    case 'sm':
      return '0 1px 2px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)';
    case 'md':
      return '0 4px 6px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06)';
    case 'lg':
      return '0 10px 15px rgba(0,0,0,0.12), 0 4px 6px rgba(0,0,0,0.08)';
    case 'none':
    case undefined:
    default:
      return 'none';
  }
}

/**
 * 計算 CTA 按鈕的 opacity（v0.7.3 新增）。
 * - 未設定 → 1（完全不透明）
 * - 設定值 → clamp 到 [0.1, 1]，避免使用者把按鈕完全透明導致看不見
 */
export function getCtaOpacity(opacity: number | undefined): number {
  if (typeof opacity !== 'number') return 1;
  return Math.max(0.1, Math.min(1, opacity));
}
