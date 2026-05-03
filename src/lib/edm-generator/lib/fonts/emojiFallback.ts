/**
 * Emoji fallback chain（v0.7.2）
 *
 * 為什麼需要？
 *   - 大多數現代作業系統（macOS / iOS / Win 10+ / Android）會自動把 emoji 字元用系統
 *     emoji 字型 render，但少數舊環境（Win 7 系統字型 / 舊版 Outlook desktop）會
 *     用主字型 render emoji → 顯示為□或單色字符。
 *   - 在 fontFamily stack 的最末端 append 一串「emoji 字型 fallback」，可確保任何
 *     環境都至少能 render 出彩色 emoji。
 *
 * 設計：
 *   - `EMOJI_FONT_STACK_TAIL`：字串尾巴常數，包含 Apple / Segoe UI / Noto Color Emoji
 *   - `withEmojiFallback(stack)`：附加 emoji fallback 到任何 fontFamily stack
 *   - `withEmojiFallbackTypography(t)`：對整個 Typography object 的所有 font 欄位套 helper
 *
 * 純函式、無 DOM 依賴，可在 server / browser / Node 共用。
 */

import type { Typography } from '@edm/types/theme';

/**
 * Emoji 字型 stack 尾巴（按優先級排列）：
 *   - "Apple Color Emoji"：macOS / iOS 內建
 *   - "Segoe UI Emoji"：Windows 10+ 內建
 *   - "Noto Color Emoji"：Google Fonts 載入版本（Android、Linux 預設、Web font fallback）
 *   - "EmojiOne Color"：較舊系統可能存在
 */
export const EMOJI_FONT_STACK_TAIL =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "EmojiOne Color"';

/**
 * 把 emoji fallback 附加到一個 fontFamily stack 末端。
 *
 * 已含 "Noto Color Emoji" 的 stack 不會重複附加（避免污染）。
 * 空字串 / undefined → 回傳純 emoji stack，避免結果為空。
 */
export function withEmojiFallback(stack: string | undefined | null): string {
  if (!stack || !stack.trim()) return EMOJI_FONT_STACK_TAIL;
  if (stack.includes('Noto Color Emoji') || stack.includes('Apple Color Emoji')) {
    return stack;
  }
  return `${stack}, ${EMOJI_FONT_STACK_TAIL}`;
}

/**
 * 把 Typography object 的所有 font 欄位都套上 emoji fallback。
 * 在 EmailTemplate 入口呼叫一次即可，避免改 37 處 inline fontFamily。
 */
export function withEmojiFallbackTypography(t: Typography): Typography {
  return {
    ...t,
    headingFont: withEmojiFallback(t.headingFont),
    bodyFont: withEmojiFallback(t.bodyFont),
    displayFont: t.displayFont ? withEmojiFallback(t.displayFont) : undefined,
    accentFont: t.accentFont ? withEmojiFallback(t.accentFont) : undefined,
  };
}
