/**
 * 模板覺察 hero 圖規格（template-aware image profile）
 *
 * 對應 templateCopyProfile，但服務的是「視覺－模板一致性」：
 *   - AI 生圖時 append 模板專屬的 visual hint（lighting / palette / aesthetic）
 *   - 圖庫搜尋時補上模板偏好的英文 stock keyword
 *   - ImagePanel 切到 AI / Stock tab 時，預設 style / query 跟著模板走
 *
 * 模板美學參考：
 *   - Classic    : navy & gold, corporate photography
 *   - Modern     : dark + neon, holographic UI
 *   - Minimal    : negative space, monochrome
 *   - Magazine   : editorial photography, beige tones, fine-art comp
 *   - Academic   : formal institutional, indigo & white
 *   - Vibrant    : bright sunrise palette, flat illustration
 */

import type { ImageStyle } from './generateImage';

export interface TemplateImageProfile {
  /** 該模板最契合的 AI 生圖風格（對應 ImageStyle） */
  recommendedStyle: ImageStyle;
  /** AI 生圖 prompt 末尾追加的英文 visual cue（lighting、palette、aesthetic） */
  visualKeywords: string;
  /** 圖庫（Unsplash / Pexels）搜尋時補上的英文 keyword，會 concat 到使用者輸入後 */
  stockKeywords: string;
  /** 中文描述（給 UI 顯示「目前模板偏好：…」用） */
  label: string;
}

export const TEMPLATE_IMAGE_PROFILES: Record<string, TemplateImageProfile> = {
  classic: {
    recommendedStyle: 'photo',
    visualKeywords:
      'professional corporate editorial photography, warm sophisticated lighting, navy blue and gold tones, sense of trust and reliability, depth of field',
    stockKeywords: 'corporate professional business meeting trust',
    label: '經典商務（穩重攝影 / 海軍藍金色調）',
  },
  modern: {
    recommendedStyle: 'tech',
    visualKeywords:
      'futuristic dark technology aesthetic, neon accent lighting in cyan and magenta, holographic data visualisation, clean minimal composition, high contrast',
    stockKeywords: 'technology code computer dark neon developer',
    label: '現代科技（暗色霓虹 / 全息感）',
  },
  minimal: {
    recommendedStyle: 'minimal',
    visualKeywords:
      'extreme negative space, single subject, soft monochrome palette, gallery-quality minimalism, calm and sparse composition',
    stockKeywords: 'minimal white space single object calm',
    label: '簡潔留白（負空間 / 黑白單色）',
  },
  magazine: {
    recommendedStyle: 'photo',
    visualKeywords:
      'editorial magazine cover photography, slightly desaturated warm beige and muted earth tones, fine-art composition with rule of thirds, soft natural light',
    stockKeywords: 'editorial magazine cover beige warm aesthetic vintage',
    label: '雜誌風（刊物攝影 / 米色暖調）',
  },
  academic: {
    recommendedStyle: 'photo',
    visualKeywords:
      'formal institutional photography, indigo and white palette, university library or auditorium setting, academic ceremony aesthetic, soft cool light',
    stockKeywords: 'university library lecture academic indigo formal',
    label: '學術正式（公文感 / 紫藏白配色）',
  },
  vibrant: {
    recommendedStyle: 'illustration',
    visualKeywords:
      'bright cheerful flat illustration, sunrise palette of yellow coral peach, playful geometric shapes, energetic optimistic composition, no text',
    stockKeywords: 'colorful bright happy student campus illustration',
    label: '活潑校園（亮色插畫 / 朝陽色系）',
  },

  // ─────────────────────────────────────────────
  // v0.6.0：6 個新模板
  // ─────────────────────────────────────────────

  bulletin: {
    recommendedStyle: 'photo',
    visualKeywords:
      'serious announcement photography, a clear focal subject with strong directional lighting, slight tilt, sense of urgency and importance, clean uncluttered background',
    stockKeywords: 'announcement notice deadline urgent serious news',
    label: '公告佈告（新聞感攝影 / 明確主體）',
  },

  gradient: {
    recommendedStyle: 'gradient',
    visualKeywords:
      'soft mesh gradient with teal and dusty pink, dreamy atmosphere, abstract flowing shapes, calm forward-looking palette, sense of openness and possibility',
    stockKeywords: 'gradient mesh teal pink soft abstract future',
    label: '漸層流光（霧青粉紫漸層 / 流動感）',
  },

  editorial: {
    recommendedStyle: 'photo',
    visualKeywords:
      'high-contrast editorial portrait with deep shadows, dark moody atmosphere, single strong subject, classic literary aesthetic, sophisticated composition',
    stockKeywords: 'editorial dark moody contrast portrait literary leadership',
    label: '編輯特輯（暗調肖像 / 文學感）',
  },

  paper: {
    recommendedStyle: 'photo',
    visualKeywords:
      'still life photography on textured paper or linen, warm natural light, vintage objects (brass pen, dried flower, old book), calm humanist mood',
    stockKeywords: 'paper vintage humanities calm still life calligraphy',
    label: '紙本信箋（紙質靜物 / 暖光人文）',
  },

  kanban: {
    recommendedStyle: 'isometric',
    visualKeywords:
      'isometric illustration of workflow boards, tickets, columns, sticky notes, clean cool blue palette, sense of structure and process clarity',
    stockKeywords: 'kanban workflow project sticky notes board agile',
    label: '看板資訊（等距 3D / 流程板示意）',
  },

  poster: {
    recommendedStyle: 'tech',
    visualKeywords:
      'bold large-scale poster aesthetic, single strong photographic subject behind heavy diagonal color blocks, festival energy, high contrast, dramatic lighting',
    stockKeywords: 'event poster festival speaker stage bold lighting crowd',
    label: '海報視覺（強烈色塊 / 大型活動感）',
  },
};

export function getTemplateImageProfile(templateId: string): TemplateImageProfile {
  return TEMPLATE_IMAGE_PROFILES[templateId] ?? TEMPLATE_IMAGE_PROFILES.classic;
}

export function recommendedImageStyleFor(templateId: string): ImageStyle {
  return getTemplateImageProfile(templateId).recommendedStyle;
}

export function templateStockKeywordsFor(templateId: string): string {
  return getTemplateImageProfile(templateId).stockKeywords;
}
