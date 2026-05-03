const MSO_HEAD_INJECTION = `
<!--[if mso]>
<style type="text/css">
  table, td, div, h1, h2, h3, p, span { font-family: "Microsoft JhengHei", "微軟正黑體", Arial, sans-serif !important; }
  table { border-collapse: collapse !important; }
  .btn { mso-padding-alt: 0; }
  a.btn { text-underline-color: transparent; }
</style>
<xml>
  <o:OfficeDocumentSettings>
    <o:AllowPNG/>
    <o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings>
</xml>
<![endif]-->
`.trim();

/**
 * 把 React 18 SSR streaming format 的 HTML 轉成 static HTML：
 *
 * React Email 的 `render()` 即使在沒有 Suspense 的元件上，也會輸出 streaming 風格的 HTML，
 * 並且可能巢狀使用多個 segment（B:0/S:0、P:1/S:1...）：
 *   <!--$?--><template id="B:0"></template><!--/$-->
 *   <div hidden id="S:0">
 *     ...真正的 EDM 內容（其中可能還含 P:1/S:1 等）...
 *   </div>
 *   <script>function $RC(...){...}; $RC("B:0","S:0")</script>
 *
 * 在一般瀏覽器頁面 OK，但在 iframe srcDoc 環境中載入時 `$RC` script 執行會 crash
 * （"Cannot read properties of null (reading 'parentNode')"），導致內容被卡在 hidden div 裡。
 *
 * 解法：在 server 端做字串清理，把 streaming 標記、placeholder template、reveal script
 * 全部移除，留下純靜態 HTML。
 */
function unwrapStreamingHtml(html: string): string {
  // 沒有 streaming 標記就直接回傳
  if (!html.includes('<!--$?-->') && !html.includes('id="S:0"') && !html.includes('id="B:0"')) {
    return html;
  }

  let out = html;

  // 1) 移除所有 streaming reveal script（function $RS / $RC + 結尾呼叫）
  out = out.replace(/<script>function \$R[CS]\([\s\S]*?<\/script>/g, '');

  // 2) 移除 placeholder template 元素：<template id="B:0"></template>、<template id="P:1"></template>...
  out = out.replace(/<template\s+id="[BP]:\d+"><\/template>/g, '');

  // 3) 把 hidden segment div 的開合 tag 移除，但保留內容：<div hidden id="S:n">...</div>
  //    用迴圈處理巢狀情況：每次只剝最外層的 <div hidden id="S:n">
  for (let i = 0; i < 20; i++) {
    const before = out;
    out = out.replace(/<div\s+hidden(?:=""\s*|\s+)id="S:\d+">/g, '');
    // 對應移除尾端 </div>：因為剛剛上面 open tag 移掉了，但 </div> 還在；
    // 然而我們無法用正則精準配對巢狀 close。改用：剛好它後面緊鄰 </div><script>$RC...
    // 但 script 也已被刪掉 → 配對 </div> 的位置可能跟其他正常 </div> 混淆。
    // 簡化策略：直接在每個 S:n 前後留下 div，但移除其 hidden 屬性，這樣內容會顯示。
    if (before === out) break;
  }
  // 改採折中：把所有 `<div hidden id="S:n">` 改成普通 div（無 hidden 屬性、無 id），
  // 配合 `</div>` 仍然存在 → DOM 結構不變、但內容可見。
  // 上面那段 replace 已經把 open tag 變成空字串，造成 unmatch。
  // 為了正確對齊，改回：把 hidden 屬性與 id 拿掉即可。
  // 重置 out，從頭再做一次更穩健的版本：
  out = html
    .replace(/<script>function \$R[CS]\([\s\S]*?<\/script>/g, '')
    .replace(/<template\s+id="[BP]:\d+"><\/template>/g, '')
    .replace(/<div\s+hidden(?:=""\s*|\s+)id="S:\d+">/g, '<div>')
    .replace(/<!--\$\?-->/g, '')
    .replace(/<!--\/\$-->/g, '')
    .replace(/<!--\$-->/g, '');

  return out;
}

export function applyOutlookFixes(html: string): string {
  let out = unwrapStreamingHtml(html);

  if (out.includes('</head>')) {
    out = out.replace('</head>', `${MSO_HEAD_INJECTION}\n</head>`);
  } else {
    out = out.replace(/<html([^>]*)>/i, `<html$1>\n<head>${MSO_HEAD_INJECTION}</head>`);
  }

  out = out.replace(/<html([^>]*?)>/i, (_m, attrs) => {
    if (attrs.includes('xmlns:o')) return `<html${attrs}>`;
    return `<html${attrs} xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:v="urn:schemas-microsoft-com:vml">`;
  });

  out = out.replace(/<a\s([^>]*\bclass=["']btn["'][^>]*)>([\s\S]*?)<\/a>/g, (match, attrs, label) => {
    const hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
    const href = hrefMatch ? hrefMatch[1] : '#';
    const styleMatch = attrs.match(/style=["']([^"']+)["']/i);
    const style = styleMatch ? styleMatch[1] : '';
    const bgMatch = style.match(/background-color\s*:\s*([^;]+)/i);
    const bg = bgMatch ? bgMatch[1].trim() : '#0070C0';
    const colorMatch = style.match(/(?<!-)color\s*:\s*([^;]+)/i);
    const color = colorMatch ? colorMatch[1].trim() : '#FFFFFF';

    const vml = `
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:200px;" arcsize="12%" stroke="f" fillcolor="${bg}">
<w:anchorlock/>
<center style="color:${color};font-family:'Microsoft JhengHei',Arial,sans-serif;font-size:15px;font-weight:bold;">${label.replace(/<[^>]+>/g, '').trim()}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
${match}
<!--<![endif]-->`.trim();
    return vml;
  });

  return out;
}
