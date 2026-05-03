/**
 * 計算「色票應該顯示的實際生效色」純函式（v0.4.3.1）
 *
 * ## 為什麼需要這個？
 *
 * 在 `BlockPaletteOverride` popover 上，每個 token 欄位旁邊有一個 `<input type="color">` 色票。
 * 如果色票直接綁 `globalTokens[key]`，會跟「該 block 上實際看到的顏色」不一致：
 *
 * - `cta.textPrimary`（沒覆寫時）→ 實際是 `readableOn(primary)`（自動對比，通常是白），
 *   但色票會顯示 `globalTokens.textPrimary`（深灰）—— 使用者看到「按鈕文字明明是白色，
 *   為什麼色票上是黑色？」會困惑。
 * - `hero.textPrimary`（classic 模板，沒覆寫時）→ 實際是 `readableOn(secondary)`，
 *   也跟 `globalTokens.textPrimary` 不一定相等。
 *
 * 這個函式回傳的是「**使用者眼睛實際看到的色**」，跟編輯端 / 預覽端 render 結果一致，
 * 同時也讓 `<input type="color">` 點開的初始色就是實際生效色（從這裡開始調最直觀）。
 *
 * ## 規則
 *
 * 1. 若使用者已明確覆寫 `block.tokensOverride[key]` → 一律以該值為準
 * 2. 否則依 `block.type + key` 走 block 自己的「衍生邏輯」（呼叫 computeCtaColors / computeHeroTextColors）
 * 3. 沒衍生邏輯的 token → 直接吃 mergedTokens（已合併 override 的全域值）
 */
import type { Block, CtaBlock, HeroBlock } from '@edm/types/blocks';
import type { ColorTokens } from '@edm/types/theme';
import type { HeroVariant } from '@edm/types/template';
import type { TokenKey } from '@edm/lib/blocks/tokenRelevance';
import { computeCtaColors } from '@edm/lib/blocks/ctaColors';
import { computeHeroTextColors } from '@edm/lib/blocks/heroColors';

/**
 * 計算 popover 色票的實際生效色。
 *
 * @param block 當前 block
 * @param key 要查的 token key
 * @param mergedTokens 已合併 `block.tokensOverride` 的 tokens（caller 負責 merge）
 * @param heroVariant hero block 才需傳；其他 block 可省略
 */
export function getEffectiveSwatchColor(
  block: Block,
  key: TokenKey,
  mergedTokens: ColorTokens,
  heroVariant?: HeroVariant,
): string {
  // 1. 已被使用者明確覆寫 → 一律以 override 為準
  if (
    block.tokensOverride &&
    Object.prototype.hasOwnProperty.call(block.tokensOverride, key)
  ) {
    return block.tokensOverride[key] as string;
  }

  // 2. 依 block.type + key 計算實際生效色（衍生邏輯）
  if (block.type === 'cta') {
    const cta = computeCtaColors(block as CtaBlock, mergedTokens);
    if (key === 'primary') {
      // outline 樣式 bg=transparent，色票無法顯示 transparent，fallback 到 token primary
      return cta.bg !== 'transparent' ? cta.bg : mergedTokens.primary;
    }
    if (key === 'textPrimary') {
      return cta.fg;
    }
    // textSecondary（副連結）沒衍生邏輯，掉到 default
  }

  if (block.type === 'hero' && heroVariant) {
    const hero = computeHeroTextColors(block as HeroBlock, mergedTokens, heroVariant);
    if (key === 'textPrimary') return hero.title;
    if (key === 'textSecondary') return hero.subtitle;
    // primary / accent / secondary / bg 對 hero 沒文字衍生邏輯，掉到 default
  }

  // 3. 沒衍生邏輯 → 直接吃 mergedTokens
  return mergedTokens[key] as string;
}
