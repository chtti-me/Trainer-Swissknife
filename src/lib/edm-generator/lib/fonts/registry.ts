/**
 * 字型註冊表（v0.7.2）
 *
 * 集中管理所有可用字型，分成五個 category：
 *   - sans-tc：中文黑體
 *   - serif-tc：中文宋體
 *   - sans-en：英文黑體
 *   - serif-en：英文襯線
 *   - decorative：裝飾 / 手寫
 *   - mono：等寬
 *   - emoji：彩色 emoji
 *   - icon：Material Symbols 圖示字型
 *
 * 每個字型包含：
 *   - id：穩定 key，存進 inline style 與 sanitizer 白名單
 *   - name：UI 顯示名稱
 *   - cssFamily：實際給 CSS 的 font-family 值，**完整含 fallback chain**
 *   - googleFontsQuery：給 Google Fonts API 的 family= 參數（沒有的字型 = 系統字型）
 *   - essential：true 表示開機預載；false 表示使用者選了才動態載入
 *
 * 設計原則：純資料、純函式，不碰 DOM。
 * 載入機制（注入 <link>）放在 fonts/loader.ts。
 */

export type FontCategory =
  | 'sans-tc'
  | 'serif-tc'
  | 'sans-en'
  | 'serif-en'
  | 'decorative'
  | 'mono'
  | 'emoji'
  | 'icon';

export interface FontDef {
  id: string;
  name: string;
  category: FontCategory;
  /** CSS font-family 值（含完整 fallback chain，可直接套到 inline style） */
  cssFamily: string;
  /**
   * Google Fonts API 的 family= 參數（不含 :wght、url-encoded 前的原值）。
   * 例：'Noto+Sans+TC:wght@400;500;700'
   *
   * undefined 表示這字型不需要 Google Fonts（系統字型）。
   */
  googleFontsQuery?: string;
  /** 是否屬於開機預載集（一定要在 index.html 與 EDM <head> 注入） */
  essential: boolean;
  /** 字型樣板（給 picker 預覽用，例：「中文 標題」） */
  sampleText?: string;
}

/**
 * 給定 fallback chain：先列指定字型，再排當地系統字型，最後是 generic family。
 * 範例：'"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif'
 */
const tcFallback = '"PingFang TC", "Microsoft JhengHei", "微軟正黑體", sans-serif';
const tcSerifFallback = '"PMingLiU", "新細明體", "Source Han Serif TC", serif';
const enSansFallback = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const enSerifFallback = 'Georgia, "Times New Roman", serif';
const monoFallback = '"SF Mono", "Consolas", "Courier New", monospace';

export const FONT_REGISTRY: FontDef[] = [
  // ───── 中文黑體（sans-tc） ─────
  {
    id: 'noto-sans-tc',
    name: '思源黑體 Noto Sans TC',
    category: 'sans-tc',
    cssFamily: `"Noto Sans TC", ${tcFallback}`,
    googleFontsQuery: 'Noto+Sans+TC:wght@300;400;500;700;900',
    essential: true,
    sampleText: '思源黑體 中華電信',
  },
  {
    id: 'noto-sans-hk',
    name: '思源黑體 Noto Sans HK',
    category: 'sans-tc',
    cssFamily: `"Noto Sans HK", ${tcFallback}`,
    googleFontsQuery: 'Noto+Sans+HK:wght@400;500;700',
    essential: false,
    sampleText: '思源黑體香港',
  },
  {
    id: 'system-tc',
    name: '系統正黑體（蘋方／微軟正黑體）',
    category: 'sans-tc',
    cssFamily: tcFallback,
    essential: true,
    sampleText: '系統黑體 中華電信',
  },

  // ───── 中文襯線（serif-tc） ─────
  {
    id: 'noto-serif-tc',
    name: '思源宋體 Noto Serif TC',
    category: 'serif-tc',
    cssFamily: `"Noto Serif TC", ${tcSerifFallback}`,
    googleFontsQuery: 'Noto+Serif+TC:wght@400;600;700;900',
    essential: true,
    sampleText: '思源宋體 雜誌風',
  },
  {
    id: 'system-tc-serif',
    name: '系統明體（PMingLiU / 新細明體）',
    category: 'serif-tc',
    cssFamily: tcSerifFallback,
    essential: true,
    sampleText: '系統明體 古典',
  },

  // ───── 英文黑體（sans-en） ─────
  {
    id: 'inter',
    name: 'Inter',
    category: 'sans-en',
    cssFamily: `"Inter", ${enSansFallback}`,
    googleFontsQuery: 'Inter:wght@400;500;600;700;900',
    essential: true,
    sampleText: 'Inter Modern Sans',
  },
  {
    id: 'roboto',
    name: 'Roboto',
    category: 'sans-en',
    cssFamily: `"Roboto", ${enSansFallback}`,
    googleFontsQuery: 'Roboto:wght@400;500;700;900',
    essential: false,
    sampleText: 'Roboto Google Standard',
  },
  {
    id: 'lato',
    name: 'Lato',
    category: 'sans-en',
    cssFamily: `"Lato", ${enSansFallback}`,
    googleFontsQuery: 'Lato:wght@400;700;900',
    essential: false,
    sampleText: 'Lato Humanist',
  },
  {
    id: 'open-sans',
    name: 'Open Sans',
    category: 'sans-en',
    cssFamily: `"Open Sans", ${enSansFallback}`,
    googleFontsQuery: 'Open+Sans:wght@400;600;700;800',
    essential: false,
    sampleText: 'Open Sans Friendly',
  },
  {
    id: 'montserrat',
    name: 'Montserrat',
    category: 'sans-en',
    cssFamily: `"Montserrat", ${enSansFallback}`,
    googleFontsQuery: 'Montserrat:wght@400;600;700;900',
    essential: false,
    sampleText: 'Montserrat Bold Display',
  },

  // ───── 英文襯線（serif-en） ─────
  {
    id: 'playfair-display',
    name: 'Playfair Display',
    category: 'serif-en',
    cssFamily: `"Playfair Display", ${enSerifFallback}`,
    googleFontsQuery: 'Playfair+Display:wght@400;600;700;900',
    essential: false,
    sampleText: 'Playfair Display Elegant',
  },
  {
    id: 'merriweather',
    name: 'Merriweather',
    category: 'serif-en',
    cssFamily: `"Merriweather", ${enSerifFallback}`,
    googleFontsQuery: 'Merriweather:wght@400;700;900',
    essential: false,
    sampleText: 'Merriweather Readable',
  },

  // ───── 裝飾 / 手寫（decorative） ─────
  {
    id: 'pacifico',
    name: 'Pacifico（手寫 Script）',
    category: 'decorative',
    cssFamily: `"Pacifico", ${tcFallback}`,
    googleFontsQuery: 'Pacifico',
    essential: false,
    sampleText: 'Pacifico 流線手寫',
  },
  {
    id: 'caveat',
    name: 'Caveat（隨筆手寫）',
    category: 'decorative',
    cssFamily: `"Caveat", ${tcFallback}`,
    googleFontsQuery: 'Caveat:wght@400;500;700',
    essential: false,
    sampleText: 'Caveat 隨筆手寫',
  },
  {
    id: 'dancing-script',
    name: 'Dancing Script（草書）',
    category: 'decorative',
    cssFamily: `"Dancing Script", ${tcFallback}`,
    googleFontsQuery: 'Dancing+Script:wght@400;700',
    essential: false,
    sampleText: 'Dancing Script 草書',
  },

  // ───── 等寬（mono） ─────
  {
    id: 'jetbrains-mono',
    name: 'JetBrains Mono',
    category: 'mono',
    cssFamily: `"JetBrains Mono", ${monoFallback}`,
    googleFontsQuery: 'JetBrains+Mono:wght@400;500;700',
    essential: false,
    sampleText: 'JetBrains Mono 1234',
  },
  {
    id: 'fira-code',
    name: 'Fira Code',
    category: 'mono',
    cssFamily: `"Fira Code", ${monoFallback}`,
    googleFontsQuery: 'Fira+Code:wght@400;500;700',
    essential: false,
    sampleText: 'Fira Code 1234',
  },

  // ───── Emoji（emoji） ─────
  // Noto Color Emoji 同時 essential，這樣全 EDM 的 emoji 自動 fallback 到一致風格
  {
    id: 'noto-color-emoji',
    name: 'Noto Color Emoji',
    category: 'emoji',
    cssFamily: '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", "EmojiOne Color", sans-serif',
    googleFontsQuery: 'Noto+Color+Emoji',
    essential: true,
    sampleText: '😀 🎉 ✨ ❤️ 🚀',
  },

  // ───── Icon font（icon） ─────
  // Material Symbols 三個 variant（Outlined / Rounded / Sharp）。Outlined 為 essential，
  // 另兩個是 on-demand。語法：<span style="font-family:..." >home</span> 會被字型 ligature 變成 icon。
  {
    id: 'material-symbols-outlined',
    name: 'Material Symbols Outlined',
    category: 'icon',
    cssFamily: '"Material Symbols Outlined"',
    googleFontsQuery: 'Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0',
    essential: true,
    sampleText: 'home star favorite',
  },
  {
    id: 'material-symbols-rounded',
    name: 'Material Symbols Rounded',
    category: 'icon',
    cssFamily: '"Material Symbols Rounded"',
    googleFontsQuery: 'Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0',
    essential: false,
    sampleText: 'home star favorite',
  },
  {
    id: 'material-symbols-sharp',
    name: 'Material Symbols Sharp',
    category: 'icon',
    cssFamily: '"Material Symbols Sharp"',
    googleFontsQuery: 'Material+Symbols+Sharp:opsz,wght,FILL,GRAD@24,400,0,0',
    essential: false,
    sampleText: 'home star favorite',
  },
];

/** 以 id 為 key 的 lookup map（O(1) 查找） */
const FONT_BY_ID: Record<string, FontDef> = Object.fromEntries(
  FONT_REGISTRY.map((f) => [f.id, f]),
);

/** 取得字型定義；不存在回 undefined */
export function getFontById(id: string): FontDef | undefined {
  return FONT_BY_ID[id];
}

/** 取得指定 category 下所有字型 */
export function getFontsByCategory(category: FontCategory): FontDef[] {
  return FONT_REGISTRY.filter((f) => f.category === category);
}

/** 開機預載集合（用於 index.html 與 EmailTemplate <head>） */
export function getEssentialFonts(): FontDef[] {
  return FONT_REGISTRY.filter((f) => f.essential);
}

/**
 * 根據傳入的字型 id 集合，產生 Google Fonts CSS2 API 的完整 URL。
 *
 * 範例：
 *   buildGoogleFontsUrl(['noto-sans-tc', 'inter'])
 *   → 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700;900&family=Inter:wght@400;500;600;700;900&display=swap'
 *
 * 沒有 googleFontsQuery 的字型（系統字型）會被自動跳過。
 * 重複 id 自動去重。回傳 null 表示沒有任何字型需要載入（避免產出空 URL）。
 */
export function buildGoogleFontsUrl(fontIds: string[]): string | null {
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const id of fontIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const def = getFontById(id);
    if (!def?.googleFontsQuery) continue;
    queries.push(`family=${def.googleFontsQuery}`);
  }
  if (queries.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${queries.join('&')}&display=swap`;
}

/**
 * 給定 RichTextEditor 內所有 font-family inline style 的字串集合，
 * 從中萃取出 registry 中的字型 id（用來驅動 on-demand 載入）。
 *
 * 比對方式：unique 化 family list 後，看每個 family stack 的「主要字型名稱」
 * （取第一個用引號包起來的字型）是否對應 registry 中某個字型的 cssFamily 主名稱。
 */
export function extractRegisteredFontIds(cssFamilyStrings: string[]): string[] {
  const ids = new Set<string>();
  for (const cssFamily of cssFamilyStrings) {
    const def = FONT_REGISTRY.find((f) => f.cssFamily === cssFamily);
    if (def) ids.add(def.id);
  }
  return Array.from(ids);
}

/**
 * 給定 inline style 字串（例：'color:red;font-family:"Inter", -apple-system, sans-serif'），
 * 萃取出 font-family 的值（含 fallback chain），找不到回 null。
 */
export function extractFontFamilyFromStyle(styleStr: string): string | null {
  const m = styleStr.match(/font-family\s*:\s*([^;]+)/i);
  if (!m) return null;
  return m[1].trim();
}
