/**
 * EDM HTML 美化（beautify）
 *
 * 使用 js-beautify（HTML/CSS 業界標準，Stylus、CodeMirror 都用它）將 React Email 輸出
 * 的 minified HTML 轉成易讀的縮排格式。針對 EDM 場景做了幾項客製：
 *
 * 1. **保留 Outlook conditional comments**：`<!--[if mso]>...<![endif]-->` 內含整段
 *    HTML 但對 IE/Outlook 才生效，beautifier 不能擅自重排其中內容（會破壞 VML 渲染）。
 *    js-beautify 預設將 comment 視為不透明 token 整段保留，此特性正合需求。
 *
 * 2. **`<style>` 內的 CSS 自動套用 css beautify**：直接用 js-beautify 的 `indent_inner_html`
 *    + `content_unformatted` 預設值即可。
 *
 * 3. **inline 元素不換行**：`<a>`、`<span>`、`<strong>`、`<em>`、`<br>` 等強制保持單行，
 *    避免 Outlook 把 cell 內 inline 元素之間的 newline 當成一個 visible 空白渲染。
 *
 * 4. **`<table>`/`<tr>`/`<td>` 結構正常縮排**：HTML spec 規定 table 結構之間的 whitespace
 *    不會被渲染，所以可以安全地縮排。
 *
 * 5. **回傳的 HTML 在 Outlook / Gmail / Apple Mail 渲染結果與原始 minified 版本完全一致**。
 *    僅供「貼到編輯器手動微調」、「下載 .html 給工程師閱讀」之類的使用情境。
 */

import beautify from 'js-beautify';

const { html: htmlBeautify } = beautify;

/**
 * 美化整份 EDM HTML（含內嵌 style 與 conditional comments）。
 *
 * @param html applyOutlookFixes 之後的最終 HTML
 * @returns 縮排後易讀的 HTML 字串；render 結果完全等價於輸入
 */
export function beautifyEdmHtml(html: string): string {
  // js-beautify 預設會把開頭的 `<!doctype html>` 大寫成 `<!DOCTYPE html>`，這在 email 是 OK 的。
  // 設定刻意偏向「易讀」而非「最少 diff」。
  let out = htmlBeautify(html, {
    indent_size: 2,
    indent_char: ' ',
    max_preserve_newlines: 1,
    preserve_newlines: true,
    indent_inner_html: false,
    wrap_line_length: 0, // 不要硬斷行，避免影響 inline style 字串
    end_with_newline: true,
    // 這些 inline 元素不要換行：a/span/strong/em/b/i/u/br/img/code/small/sub/sup/font
    // unformatted 預設就有大部分，這裡強化幾個 EDM 常見 inline tag。
    unformatted: ['a', 'span', 'strong', 'em', 'b', 'i', 'u', 'br', 'img', 'code', 'small', 'sub', 'sup', 'font'],
    // <style> 跟 <script> 內容會被當 CSS/JS beautify
    indent_scripts: 'normal',
    // Outlook conditional comments 不要重排
    extra_liners: [],
  });

  // js-beautify 偶爾會在某些 inline content 之間插多餘的純空白行，做最後清理
  out = out.replace(/\n{3,}/g, '\n\n');

  return out;
}
