/**
 * v0.7.1：Instructor.bio 從純文字升級為 sanitized HTML。
 *
 * 這個 helper 同時被 EmailTemplate（server-side / Node 環境）與 EditableCanvas（瀏覽器）
 * 使用，所以**禁止依賴 DOM API**（不能用 DOMParser / document.createElement）。
 * 全部用純字串處理，是 RichTextEditor.sanitizeOutgoing 之外的第二道防線。
 *
 * 行為：
 *  - 偵測為純文字 → escape + 換行轉 <br /> + 包一層 <p>
 *  - 偵測為 HTML → 移除 <script>、<style>、event handlers、javascript: URL，但保留排版
 *  - 空字串 → 回 ''
 */

const HTML_TAG_REGEX = /<\/?(p|br|span|strong|em|b|i|u|a|ul|ol|li|h[1-6]|code|div)\b[^>]*>/i;

const SCRIPT_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const STYLE_REGEX = /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi;
const ON_ATTR_REGEX = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_HREF_REGEX = /\s(href|src)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi;

/**
 * 把純文字（plain text）安全轉成 HTML：
 *  - HTML 特殊字元 escape
 *  - \n → <br />
 *  - 整段包在 <p>...</p> 中（與 RichTextEditor 產出的結構一致）
 */
function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // 兩個以上換行 → 段落分隔
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((para) => para.replace(/\n/g, '<br />').trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return '';
  return paragraphs.map((p) => `<p>${p}</p>`).join('');
}

/**
 * 對已是 HTML 的 bio 做最後一道 string-based 防護：
 *  - 移除 <script> / <style> 整段（含內容）
 *  - 移除所有 on* event handler attributes（onclick / onerror / ...）
 *  - 移除 href="javascript:..." / src="javascript:..."
 *
 * 注意：這不是完整的 HTML sanitizer，只是補強。主 sanitizer 在 RichTextEditor.sanitizeOutgoing。
 */
function defenseSanitize(html: string): string {
  return html
    .replace(SCRIPT_REGEX, '')
    .replace(STYLE_REGEX, '')
    .replace(ON_ATTR_REGEX, '')
    .replace(JS_HREF_REGEX, '');
}

/**
 * 預處理 Instructor.bio 用於渲染（dangerouslySetInnerHTML）。
 *
 * @param bio 原始 bio 字串（可能是 plain text 或 sanitized HTML）
 * @returns 安全的 HTML 字串，可放入 dangerouslySetInnerHTML
 */
export function prepareInstructorBio(bio: string | undefined | null): string {
  if (!bio) return '';
  const trimmed = bio.trim();
  if (!trimmed) return '';

  // 偵測是否為 HTML：包含已知 inline / block tag
  if (HTML_TAG_REGEX.test(trimmed)) {
    return defenseSanitize(trimmed);
  }

  // 純文字 → escape + nl2br + wrap <p>
  return plainTextToHtml(trimmed);
}

/**
 * 為 dangerouslySetInnerHTML 出來的 HTML 中，所有 <p> 注入預設 margin。
 *
 * 原因：信件客戶端 / 瀏覽器對 <p> 預設會給 ~16px 上下 margin，
 * 在 EDM 排版裡會造成「講師簡介上下空一大塊」。我們要把這個 margin 收緊到合理值。
 *
 * 規則：
 *  - <p> 沒有 style → 加 style="margin:<margin>"
 *  - <p style="..."> 已有 margin 屬性 → 不動（尊重使用者）
 *  - <p style="..."> 沒有 margin → 在前面 prepend "margin:<margin>;"，保留 text-align 等既有屬性
 *
 * @example injectParagraphMargin('<p>x</p><p style="text-align:center">y</p>', '0 0 6px 0')
 *   → '<p style="margin:0 0 6px 0">x</p><p style="margin:0 0 6px 0;text-align:center">y</p>'
 */
export function injectParagraphMargin(html: string, margin: string): string {
  if (!html) return '';
  return html.replace(/<p\b([^>]*)>/gi, (_match, rawAttrs: string) => {
    const styleMatch = rawAttrs.match(/\sstyle\s*=\s*"([^"]*)"/i);
    if (!styleMatch) {
      return `<p${rawAttrs} style="margin:${margin}">`;
    }
    const existing = styleMatch[1];
    if (/(^|;)\s*margin\b/i.test(existing)) {
      // 使用者已設定 margin，不覆蓋
      return `<p${rawAttrs}>`;
    }
    const newStyle = `margin:${margin};${existing}`;
    const newAttrs = rawAttrs.replace(/\sstyle\s*=\s*"[^"]*"/i, ` style="${newStyle}"`);
    return `<p${newAttrs}>`;
  });
}
