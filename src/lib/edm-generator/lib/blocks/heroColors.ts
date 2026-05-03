/**
 * Hero 文字色計算純函式（v0.4.3）
 *
 * 用途：把 6 個 hero variant 的 title / subtitle / eyebrow 顏色決策抽出來，
 * 讓**編輯端（EditableCanvas.tsx）**與**預覽端（EmailTemplate.tsx）**共用同一份來源，
 * 並對所有 variant 套上「使用者明確覆寫優先」邏輯，避免某些 variant 因為設計上寫死
 * 顏色（例如 modern 寫死白字、classic 用 readableOn 自動對比）造成「使用者改了沒反應」。
 *
 * ## 規則
 *
 * **title 色決策（textPrimary 角色）**：
 *   1. 若使用者明確覆寫 `block.tokensOverride.textPrimary` → 一律尊重該值
 *   2. 否則依 variant 走預設邏輯：
 *      - `classic`  → `readableOn(secondary)`（在 secondary 深底上自動對比）
 *      - `modern`   → 寫死 `#FFFFFF`（深底配大白字）
 *      - 其他 variant → `tokens.textPrimary`
 *
 * **subtitle 色決策（textSecondary 角色）**：
 *   1. 若使用者明確覆寫 `block.tokensOverride.textSecondary` → 一律尊重該值
 *   2. 否則依 variant 走預設邏輯：
 *      - `classic`  → `mixHex(titleColor, secondary, 0.85)`（衍生）
 *      - `modern`   → `mixHex('#FFFFFF', secondary, 0.7)`（衍生）
 *      - `academic` → `tokens.primary`（班代號刻意用主色強調）
 *      - 其他 variant → `tokens.textSecondary`
 *
 * **eyebrow 色決策**：
 *   - `classic`  → `tokens.accent`
 *   - `modern`   → `readableOn(tokens.accent)`（在 accent 膠囊內，自動對比）
 *   - `vibrant`  → `readableOn(tokens.accent)`（在 accent 膠囊內，自動對比）
 *   - 其他 variant → `tokens.textSecondary`
 *   eyebrow 短期不開放 override（因 token 角色與 title/subtitle 太接近，會讓 popover 太擁擠）
 *
 * ## 為什麼要看 `block.tokensOverride.textPrimary` 而不是 `tokens.textPrimary`?
 *
 * 因為 caller 通常會先做 `mergedTokens = { ...globalTokens, ...block.tokensOverride }`
 * 把 override merge 進來，再把 mergedTokens 傳進這個函式。此時 `tokens.textPrimary`
 * **永遠**有值（沒覆寫時是全域值），無法判斷「使用者是否明確覆寫了」。
 *
 * 所以 caller 必須**同時傳 block 與 mergedTokens**，這樣我們才能從 `block.tokensOverride`
 * 讀「own property」判斷「明確覆寫」。
 */
import type { HeroBlock } from '@edm/types/blocks';
import type { ColorTokens } from '@edm/types/theme';
import type { HeroVariant } from '@edm/types/template';
import { mixHex, readableOn } from '@edm/lib/theme/colorScale';

export interface HeroTextColors {
  /** 主標題色 */
  title: string;
  /** 副標 / 班代號色 */
  subtitle: string;
  /** eyebrow 標籤色 */
  eyebrow: string;
  /** 偵錯用：title 是否來自使用者明確覆寫 */
  titleFromOverride: boolean;
  /** 偵錯用：subtitle 是否來自使用者明確覆寫 */
  subtitleFromOverride: boolean;
}

const hasOwn = (
  obj: Partial<ColorTokens> | undefined,
  key: keyof ColorTokens,
): boolean => !!obj && Object.prototype.hasOwnProperty.call(obj, key);

/**
 * 計算 hero 三組文字色（title / subtitle / eyebrow）。
 *
 * @param block 目標 HeroBlock（會看 block.tokensOverride 判斷明確覆寫）
 * @param tokens **已 merge 過 override** 的 ColorTokens（caller 負責 merge）
 * @param variant 該模板的 hero variant（決定預設配色邏輯）
 */
export function computeHeroTextColors(
  block: HeroBlock,
  tokens: ColorTokens,
  variant: HeroVariant,
): HeroTextColors {
  const titleFromOverride = hasOwn(block.tokensOverride, 'textPrimary');
  const subtitleFromOverride = hasOwn(block.tokensOverride, 'textSecondary');

  // 1. 計算 variant 預設色
  let title: string;
  let subtitle: string;
  let eyebrow: string;

  switch (variant) {
    case 'classic': {
      const t = readableOn(tokens.secondary);
      title = t;
      subtitle = mixHex(t, tokens.secondary, 0.85);
      eyebrow = tokens.accent;
      break;
    }
    case 'modern': {
      title = '#FFFFFF';
      subtitle = mixHex('#FFFFFF', tokens.secondary, 0.7);
      eyebrow = readableOn(tokens.accent);
      break;
    }
    case 'academic': {
      title = tokens.textPrimary;
      // academic 設計上「班代號」用主色強調（非一般 textSecondary）
      subtitle = tokens.primary;
      eyebrow = tokens.textSecondary;
      break;
    }
    case 'vibrant': {
      title = tokens.textPrimary;
      subtitle = tokens.textSecondary;
      eyebrow = readableOn(tokens.accent);
      break;
    }
    case 'minimal':
    case 'magazine':
    default: {
      title = tokens.textPrimary;
      subtitle = tokens.textSecondary;
      eyebrow = tokens.textSecondary;
      break;
    }
  }

  // 2. 明確覆寫一律勝出（使用者點 🎨 改了就要看到變化）
  if (titleFromOverride) {
    title = block.tokensOverride!.textPrimary as string;
  }
  if (subtitleFromOverride) {
    subtitle = block.tokensOverride!.textSecondary as string;
  }

  return { title, subtitle, eyebrow, titleFromOverride, subtitleFromOverride };
}
