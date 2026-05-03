/**
 * Fonts barrel — 對外統一入口
 */

export {
  FONT_REGISTRY,
  getFontById,
  getFontsByCategory,
  getEssentialFonts,
  buildGoogleFontsUrl,
  extractRegisteredFontIds,
  extractFontFamilyFromStyle,
} from './registry';
export type { FontDef, FontCategory } from './registry';
export {
  ensureFontsLoaded,
  ensureEssentialFontsLoaded,
  isAnyGoogleFontPreloaded,
  getLoadedFontIds,
} from './loader';
export {
  EMOJI_FONT_STACK_TAIL,
  withEmojiFallback,
  withEmojiFallbackTypography,
} from './emojiFallback';
export {
  MATERIAL_ICONS,
  MATERIAL_ICON_CATEGORY_LABEL,
  MATERIAL_ICON_CATEGORY_ORDER,
  getMaterialIconsByCategory,
  buildMaterialIconHtml,
} from './materialIcons';
export type { MaterialIconDef, MaterialIconCategory } from './materialIcons';
