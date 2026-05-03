/**
 * 段落文字（copy block）「inline 樣式注入」共用 helper（v0.7.4.3）。
 *
 * # 為什麼存在
 *
 * 在 v0.7.4.3 之前，三個渲染端對 RTE 產出的 HTML 各自做不同處理 —— 三邊看到的視覺**不一致**：
 *
 * | 渲染端 | 入口 | 對 `<ol>` 的處理 | 對 `<p>/<ul>/<li>/<strong>` 的處理 |
 * |---|---|---|---|
 * | RTE 編輯器內 contentEditable | `<RichTextEditor>` | prose `[&_ol]:list-decimal [&_ol]:pl-5` 有編號 | prose tailwind class 套樣式 |
 * | 編輯模式（EditableCanvas） | `EditableHtml` non-edit 分支 | `dangerouslySetInnerHTML` 直接塞、**完全沒套 list-style 與 padding-left** | 同上 |
 * | 預覽 / 匯出（EmailTemplate） | `CopyRenderer` | `sanitizeCopy()` **完全漏掉**、只處理 ul / li / p / strong | regex 替換成帶 inline style 的標籤 |
 *
 * 結果：使用者在 RTE 編輯時看到「1. 測試」，按關閉後在編輯模式只剩「測試」（沒編號），
 * 切到預覽又出現「1.」但 padding 跟 RTE 不同 ── 同一份 HTML 三個地方完全不同樣！
 *
 * 抽出此函式，**EmailTemplate 與 EditableCanvas 100% 共用同一條邏輯**，
 * 加上 RTE 的 prose className 對齊 padding/margin 數值，三端視覺收斂為一致。
 *
 * # 為什麼用 regex 而不是 DOMParser
 *
 * `EmailTemplate.CopyRenderer` 在伺服器端 React Email render 流程中也會跑（用於匯出 HTML），
 * 那邊**沒有 DOM API**。改用純字串 regex 確保兩端通用。
 *
 * RTE 出來的 HTML 已經由 `sanitizeOutgoing` 清理過 —— ul / ol / li 預期是裸標籤
 * （sanitize 不會自動加 attribute），即使 li 帶 `style="text-align:center"`，
 * 我們的 regex 也能 smart merge（保留原 style，把預設 inline style 加到前面）。
 *
 * # 為什麼這 5 個 tag
 *
 * - `<p>`：段落 margin / line-height + 確保色彩繼承
 * - `<ul>` / `<ol>`：列表 padding-left（marker 才看得到）+ margin
 * - `<li>`：item 之間 margin + 行高
 * - `<strong>`：font-weight:700 + 色彩繼承（有些 Outlook 字型 strong 預設不夠粗）
 *
 * 不處理 `<em>` / `<a>` / `<span>` —— 它們的預設 style 已夠（em italic、a 已 inherit color，
 * span 的 style 由 sanitizeOutgoing 控管）。
 */

import type { ColorTokens } from '@edm/types/theme';

/**
 * 把 inline style 段（不含外層 `style="..."` 雙引號）prepend 到 attrs 中既有的 style，
 * 沒 style 就新增。回傳一個 `<tag${result}>` 可直接拼進 HTML 字串。
 *
 * 範例：
 * - `mergeStyle(' class="x"', 'margin:0')` → `' class="x" style="margin:0"'`
 * - `mergeStyle(' style="color:red"', 'margin:0')` → `' style="margin:0;color:red"'`
 * - `mergeStyle('', 'margin:0')` → `' style="margin:0"'`
 *
 * 注意 prepend：我們的預設 style 在前，使用者既有 style 在後 —— **後者有更高優先權**
 * （CSS cascade 同優先級時，後寫的覆蓋前寫的），所以使用者的 `text-align:center` 會贏，
 * 但 padding-left 等使用者沒設的會用我們的預設值。
 */
function mergeStyle(attrs: string, defaultStyle: string): string {
  const styleMatch = attrs.match(/\sstyle="([^"]*)"/);
  if (styleMatch) {
    const userStyle = styleMatch[1].trim();
    const merged = `${defaultStyle};${userStyle}`;
    return attrs.replace(/\sstyle="[^"]*"/, ` style="${merged}"`);
  }
  return `${attrs} style="${defaultStyle}"`;
}

/**
 * 工廠：對特定 tag 名稱建立 inline-style 注入 regex replacer。
 * 同時 handle 裸標籤（`<ol>`）與帶 attribute（`<ol class="x">` / `<li style="...">`）兩種。
 */
function makeInjector(tag: string, defaultStyle: string): (html: string) => string {
  // 比對：開頭 `<tag>` 或 `<tag 任意 attr>`，但不能誤吃 `<tag` 開頭其他 tag（例如 `<table>` 不能被 `<t` 命中）
  const re = new RegExp(`<${tag}(\\s[^>]*)?>`, 'gi');
  return (html) =>
    html.replace(re, (_full, attrs = '') => `<${tag}${mergeStyle(attrs ?? '', defaultStyle)}>`);
}

/**
 * 把 RTE 出來的 HTML 補上 Outlook 友善 + 跨端一致的 inline style（v0.7.4.3）。
 *
 * @param html  sanitizeOutgoing 過的 HTML（裸標籤或帶白名單 inline style）
 * @param tokens 當前模板色票（影響 strong / p / ul / ol 文字色繼承）
 * @returns 帶 inline style 的 HTML，編輯模式 / 預覽 / 匯出三端視覺一致
 */
export function inlineCopyHtml(html: string, tokens: ColorTokens): string {
  if (!html) return html;

  /**
   * 各 tag 的預設 inline style：
   * - 數值（margin / padding-left / line-height）需與 RTE prose className 中的設定**完全對齊**，
   *   不然 RTE 編輯區與最終樣貌仍會差一截。
   * - color 用 tokens.textPrimary：避免 light template 的內文跑出深色背景下的 hard-coded 色
   */
  const out = [
    makeInjector('p', `margin:6px 0;color:${tokens.textPrimary};line-height:1.75`),
    // ol / ul 的 padding-left:24px 與 RTE prose `pl-5`（20px）刻意改大 4px ——
    // 因為 RTE 是 prose-sm（小一級），預覽是正常字級，padding 比例需要再放大才視覺一致
    makeInjector('ul', `margin:8px 0;padding-left:24px;color:${tokens.textPrimary}`),
    makeInjector('ol', `margin:8px 0;padding-left:24px;color:${tokens.textPrimary}`),
    makeInjector('li', `margin:4px 0;line-height:1.7`),
    makeInjector('strong', `color:${tokens.textPrimary};font-weight:700`),
  ].reduce((acc, injector) => injector(acc), html);

  return out;
}
