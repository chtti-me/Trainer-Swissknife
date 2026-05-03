import JSZip from 'jszip';
// v0.5.2：file-saver 在 Node ESM 環境下沒有 named export，改 default import 後取出 saveAs。
// Vite 端透過 interop 支援兩種寫法皆可，這裡選擇兼容性最高的 default import 方式。
import FileSaver from 'file-saver';
const { saveAs } = FileSaver;
import type { Block } from '@edm/types/blocks';
import { isElectron } from '@edm/lib/utils';

export async function exportHtmlFile(html: string, filename: string): Promise<void> {
  if (isElectron()) {
    const path = await window.edm.saveFile({
      defaultName: filename,
      content: html,
      encoding: 'utf-8',
      filters: [{ name: 'HTML', extensions: ['html'] }],
    });
    if (!path) throw new Error('使用者取消');
    return;
  }
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  saveAs(blob, filename);
}

export interface ZipExportOpts {
  html: string;
  blocks: Block[];
  baseName: string;
}

/**
 * v0.5.2：抽出純粹「打包 HTML + 圖片成 ZIP」的部分，回傳 Blob。
 *
 * exportZip 內部走這個函式 + saveAs 完成下載；
 * 整合層也可以直接用這個函式拿 blob，不走預設下載（例：上傳到 R2）。
 */
export async function buildZipBlob(opts: ZipExportOpts): Promise<Blob> {
  const { html, baseName } = opts;
  const zip = new JSZip();

  const dataUrlMatches = Array.from(html.matchAll(/src=["'](data:([^;]+);base64,([^"']+))["']/g));
  const folder = zip.folder('images');
  let outHtml = html;
  let counter = 0;
  const processed = new Map<string, string>();

  for (const m of dataUrlMatches) {
    const dataUrl = m[1];
    const mime = m[2];
    const b64 = m[3];
    if (processed.has(dataUrl)) continue;
    counter++;
    const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1] ?? 'png';
    const name = `images/img-${counter}.${ext}`;
    folder?.file(`img-${counter}.${ext}`, b64, { base64: true });
    outHtml = outHtml.split(dataUrl).join(`./${name}`);
    processed.set(dataUrl, name);
  }

  zip.file(`${baseName}.html`, outHtml);
  zip.file(
    'README.txt',
    '此 ZIP 內 HTML 為 Outlook 相容版本。\n圖片已分離至 images 資料夾，請保持相對路徑使用。\n如需單檔 inline，請改用「下載 HTML」。',
  );

  return await zip.generateAsync({ type: 'blob' });
}

export async function exportZip(opts: ZipExportOpts): Promise<void> {
  const blob = await buildZipBlob(opts);
  saveAs(blob, `${opts.baseName}.zip`);
}
