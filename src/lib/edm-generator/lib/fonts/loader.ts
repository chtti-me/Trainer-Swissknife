/**
 * 字型動態載入器（v0.7.2）
 *
 * 職責：在執行階段把指定字型的 Google Fonts `<link rel="stylesheet">` 動態注入到
 * `document.head`。**冪等**：同一字型重複呼叫不會重複注入。
 *
 * 為什麼要動態載入？
 *  - `index.html` 已預載 essential 字型（Noto Sans TC、Noto Serif TC、Inter、
 *    Noto Color Emoji、Material Symbols Outlined）給開機體驗一致
 *  - 但其餘 ~13 個字型（Roboto / Lato / Pacifico / Caveat ...）只在使用者於
 *    RichTextEditor 選了之後才載入，避免一開機就拉滿 18 個 web font
 *
 * 這個檔案會碰 DOM（document.head / document.createElement），所以**只能在瀏覽器 / Electron renderer 用**。
 * Server-side / Node esbuild bundle（如 React Email render）請改用 fonts/registry 的純函式。
 */

import { buildGoogleFontsUrl, getEssentialFonts, getFontById } from './registry';

/** 已注入的字型 id 集合（記憶體內，single page lifetime）。 */
const loaded = new Set<string>();

/** 記下最後一次注入的 <link> element，用於除錯（不會被 GC，保證留在 head） */
const linkByFontId = new Map<string, HTMLLinkElement>();

/**
 * 確保指定字型已注入到 document.head。
 *
 * @param fontIds 一或多個 registry 中的字型 id
 * @returns 實際本次新注入的字型 id 列表（已注入過的會被略過）
 *
 * 不對 SSR 友善：如果 `typeof document === 'undefined'`，會直接 return []（no-op）。
 * 這讓 ensureFontsLoaded 可以放在 useEffect / event handler 之外的地方也安全（例如 store middleware）。
 */
export function ensureFontsLoaded(fontIds: string[]): string[] {
  if (typeof document === 'undefined') return [];
  const fresh = fontIds.filter((id) => !loaded.has(id) && getFontById(id)?.googleFontsQuery);
  if (fresh.length === 0) return [];

  const url = buildGoogleFontsUrl(fresh);
  if (!url) return [];

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  link.dataset.edmFonts = fresh.join(',');
  document.head.appendChild(link);

  for (const id of fresh) {
    loaded.add(id);
    linkByFontId.set(id, link);
  }

  return fresh;
}

/**
 * 應用程式啟動時呼叫，注入所有 essential 字型。
 *
 * 通常 essential 已經在 index.html 用 <link> 預載，這個 helper 是「安全網」：
 * 如果 host 整合 EDM Generator 時提供了乾淨的 index.html（沒預載），
 * 我們在 React mount 時補注入，確保字型一定可用。
 */
export function ensureEssentialFontsLoaded(): string[] {
  const ids = getEssentialFonts().map((f) => f.id);
  return ensureFontsLoaded(ids);
}

/**
 * 偵測 essential 字型是否已經由 index.html 預載過。
 * 用於避免 React 端重複注入相同字型（next-load-from-script 與 link tag-from-html 都指向同一 URL，
 * 瀏覽器會 dedupe，但避免 noise 仍值得偵測）。
 *
 * 偵測方式：head 中是否已有 fonts.googleapis.com 的 stylesheet link。
 */
export function isAnyGoogleFontPreloaded(): boolean {
  if (typeof document === 'undefined') return false;
  const links = document.head.querySelectorAll('link[rel="stylesheet"]');
  for (const link of Array.from(links)) {
    const href = link.getAttribute('href') ?? '';
    if (href.includes('fonts.googleapis.com')) return true;
  }
  return false;
}

/** 內部用（測試用），重置 loaded 狀態 */
export function __resetLoadedForTest(): void {
  loaded.clear();
  linkByFontId.clear();
}

/** 取得已注入的字型 id 列表（用於 debug / verify） */
export function getLoadedFontIds(): string[] {
  return Array.from(loaded);
}
