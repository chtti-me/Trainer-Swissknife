/**
 * RichTextEditor 的 HTML sanitizer（v0.7.4 從 RichTextEditor.tsx 拆出）。
 *
 * # 為什麼要拆出來？
 *
 * 在 v0.7.3 之前，`sanitizeOutgoing` 跟 `RichTextEditor` 元件都從 `RichTextEditor.tsx` export。
 * 這違反 React Fast Refresh 的契約 ——「元件檔只能 export 元件」—— 結果是：
 *   - 每次改 RichTextEditor.tsx 都會 full reload（不是 HMR）
 *   - Console 出現 `[vite] (client) hmr invalidate ... Could not Fast Refresh` 警告
 *
 * 拆到獨立檔之後：
 *   - RichTextEditor.tsx 純粹只 export `RichTextEditor` 元件 → Fast Refresh 100% 工作
 *   - 任何依賴 sanitizer 的元件（EditableCanvas 等）import 這個檔，與 RTE 互不影響
 *
 * # 為什麼純字串處理不夠，要用 DOMParser？
 *
 * `prepareInstructorBio.ts` 已經是純字串 sanitizer（regex-based），但那只是「最後一道防線」。
 * 主 sanitizer 必須做以下這些 regex 沒辦法乾淨處理的事：
 *   - 把 `<b>`/`<i>`/`<font>` 重寫成 `<strong>`/`<em>`/`<span style>`（要重組 attribute）
 *   - 移除非白名單 attribute（要 walk 每個 element 的 attribute list）
 *   - 把 `<a>` 自動補 `target="_blank" rel="noopener noreferrer"`
 *   - 移除「視覺上為空」的 root（孤立 `<br>`、`<p><br></p>` 等）
 *
 * 這個檔依賴 `DOMParser`，所以**只能在瀏覽器環境**用。Node 端（如 React Email render）必須用
 * `prepareInstructorBio` 的純字串版。
 */

// ---------------------------------------------------------------------------
// 白名單常數
// ---------------------------------------------------------------------------

/**
 * Outlook 相容的 inline style 白名單。
 *
 * 為什麼這 5 個：
 *   - color / background-color / font-size：跨客戶端通用（Outlook 2007+ 全都支援）
 *   - text-align：用在 <p>, <h1-6>, <li>，所有客戶端都尊重
 *   - font-family（v0.7.2 新增）：所有信件客戶端都支援，但需注意 Outlook desktop 不會載
 *     web font，會 fallback 到字型 stack 中第一個可用的 system font，所以 registry 的
 *     `cssFamily` 都帶完整 fallback chain 確保 Outlook 也有合理顯示
 *
 * 不在這個 list 的 style（margin / padding / border / line-height ...）會被剔除，
 * 避免使用者在 contentEditable 不小心引入「背景色透到整段」之類的副作用。
 */
const ALLOWED_STYLE_PROPS = new Set([
  'color',
  'background-color',
  'font-size',
  'font-family',
  'text-align',
]);

/**
 * `<font size="1..7">` 的 1-7 對應 px。
 * `document.execCommand('fontSize', ...)` 預設只接受 1-7 而不是 px，所以舊瀏覽器會產出
 * `<font size="7">` 這種 markup。這個 map 把它翻譯成現代的 `font-size:Npx`。
 */
const FONT_SIZE_MAP: Record<string, number> = {
  '1': 10,
  '2': 13,
  '3': 16,
  '4': 18,
  '5': 24,
  '6': 32,
  '7': 48,
};

// ---------------------------------------------------------------------------
// 內部工具
// ---------------------------------------------------------------------------

/**
 * 把 element 的 style 屬性壓縮為白名單版本；
 * 若白名單後 style 為空就移除整個 attribute。
 */
function sanitizeStyle(el: HTMLElement): void {
  const raw = el.getAttribute('style');
  if (!raw) return;
  const kept: string[] = [];
  raw.split(';').forEach((decl) => {
    const idx = decl.indexOf(':');
    if (idx <= 0) return;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();
    if (!prop || !val) return;
    if (ALLOWED_STYLE_PROPS.has(prop)) {
      kept.push(`${prop}:${val}`);
    }
  });
  if (kept.length === 0) {
    el.removeAttribute('style');
  } else {
    el.setAttribute('style', kept.join(';'));
  }
}

// ---------------------------------------------------------------------------
// 主要匯出
// ---------------------------------------------------------------------------

/**
 * 將 contentEditable 產出的雜亂 HTML 清理成 Outlook 友善版本：
 * - `<b>` → `<strong>`, `<i>` → `<em>`, `<div>` → `<p>`
 * - `<font color="X" size="Y">` → `<span style="color:X;font-size:Ypx">`
 * - `<span>` 保留（v0.7.1 起），但 style 只保留白名單屬性
 * - `<a>` 自動補 `target="_blank" rel="noopener noreferrer"`
 * - 清除空 `<p>`
 * - root 整體「視覺上為空」（孤立 `<br>`、空 `<p><br></p>` 等）→ 回傳空字串，
 *   讓 RichTextEditor 的 `:empty:not(:focus)::before` placeholder hint 能在「使用者全選刪除」
 *   後重現
 *
 * @param html contentEditable 的 innerHTML
 * @returns 清理後的 HTML，視覺上為空時回傳 `''`
 */
export function sanitizeOutgoing(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return '';

  const ALLOWED_ATTRS: Record<string, string[]> = {
    a: ['href', 'target', 'rel', 'style'],
    span: ['style'],
    p: ['style'],
    h1: ['style'],
    h2: ['style'],
    h3: ['style'],
    h4: ['style'],
    li: ['style'],
    ul: ['style'],
    ol: ['style'],
    strong: ['style'],
    em: ['style'],
    code: ['style'],
  };
  const TAG_MAP: Record<string, string> = { B: 'strong', I: 'em' };

  const walk = (node: Node): void => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const upper = el.tagName;

    // <b>, <i> → <strong>, <em>
    if (TAG_MAP[upper]) {
      const replaced = doc.createElement(TAG_MAP[upper]);
      const styleAttr = el.getAttribute('style');
      if (styleAttr) replaced.setAttribute('style', styleAttr);
      while (el.firstChild) replaced.appendChild(el.firstChild);
      el.replaceWith(replaced);
      Array.from(replaced.childNodes).forEach(walk);
      return;
    }

    // <div> → <p>
    if (upper === 'DIV') {
      const p = doc.createElement('p');
      const styleAttr = el.getAttribute('style');
      if (styleAttr) p.setAttribute('style', styleAttr);
      while (el.firstChild) p.appendChild(el.firstChild);
      el.replaceWith(p);
      Array.from(p.childNodes).forEach(walk);
      return;
    }

    // <font color size> → <span style>
    if (upper === 'FONT') {
      const span = doc.createElement('span');
      const styles: string[] = [];
      const color = el.getAttribute('color');
      if (color) styles.push(`color:${color}`);
      const size = el.getAttribute('size');
      if (size) {
        const px = FONT_SIZE_MAP[size] ?? 14;
        styles.push(`font-size:${px}px`);
      }
      if (styles.length > 0) span.setAttribute('style', styles.join(';'));
      while (el.firstChild) span.appendChild(el.firstChild);
      el.replaceWith(span);
      Array.from(span.childNodes).forEach(walk);
      return;
    }

    // SPAN 之前是被消滅，v0.7.1 改為保留並 sanitize style
    // （字色 / 背景色 / 字級都是 SPAN[style="..."]）
    const tagLower = upper.toLowerCase();
    const allowed = ALLOWED_ATTRS[tagLower] ?? [];
    Array.from(el.attributes).forEach((attr) => {
      if (!allowed.includes(attr.name)) {
        el.removeAttribute(attr.name);
      }
    });
    sanitizeStyle(el);

    if (upper === 'A') {
      const href = el.getAttribute('href') || '';
      if (/^https?:|^mailto:|^tel:/.test(href)) {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    }

    // 內容為空 + 沒有有效 style 的 SPAN：去殼（避免 sanitize 後留下空 <span></span>）
    if (upper === 'SPAN' && !el.getAttribute('style')) {
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
        Array.from(parent.childNodes).forEach(walk);
        return;
      }
    }

    Array.from(el.childNodes).forEach(walk);
  };

  Array.from(root.childNodes).forEach(walk);

  // 清理空 <p>
  Array.from(root.querySelectorAll('p')).forEach((p) => {
    if (!p.textContent?.trim() && p.children.length === 0) p.remove();
  });

  // v0.7.2.1：root 整體「視覺上為空」也回傳空字串。
  // 包含三種情況：
  //   1. root 完全沒 child（已被前面清空 <p> 處理過）
  //   2. root 只剩孤立的 <br>（contentEditable 全選刪除後 Chrome / Edge 留下的殘留）
  //   3. root 內所有元素的 textContent 加起來為空，且沒有任何「內容元素」
  //      （img / a / hr / table / list / heading / code 等）
  // 這樣才能讓 :empty hint 在「使用者刪光」情境下也重現。
  const text = (root.textContent ?? '').trim();
  const hasMeaningfulElement = root.querySelector(
    'img, a, hr, table, ul, ol, code, h1, h2, h3, h4, h5, h6',
  );
  if (text === '' && !hasMeaningfulElement) return '';

  return root.innerHTML.trim();
}
