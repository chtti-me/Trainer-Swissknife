import html2canvas from 'html2canvas';
import * as htmlToImage from 'html-to-image';
import { downloadBlob } from '@edm/lib/utils';
import { renderEdmHtml } from '@edm/lib/email/render';
import type { EmailTemplateProps } from '@edm/lib/email/EmailTemplate';

const TRANSPARENT_PX =
  'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

/** PNG 匯出時四邊留白（px），避免內容貼到圖片邊緣被裁切 */
const EXPORT_PADDING = 28;
/** 內部 EDM 容器寬度（與 React Email Container 一致） */
const EDM_INNER_WIDTH = 640;

/**
 * v0.4.4：PNG 匯出進度階段。
 *
 * 每個階段對應一個給使用者看的進度文案，由 caller 自行決定要不要顯示。
 */
export type PngExportPhase =
  | 'preparing'
  | 'preload-images'
  | 'rendering'
  | 'fallback-rendering'
  | 'finalizing';

/**
 * v0.4.4：PNG 匯出失敗的分類碼。
 *
 * 把失敗原因抽成 enum，UI 可以針對每種給出更友善的中文訊息：
 *   - `fallback-failed`：主路徑（html2canvas）與備援（html-to-image）都拋錯
 *   - `empty-output`：兩條路徑都跑完但 blob/dataUrl 為空（極少見，但理論上可能）
 *   - `prepare-failed`：在序列化 EDM HTML 階段就出錯（通常是 props 異常）
 */
export type PngExportErrorCode =
  | 'fallback-failed'
  | 'empty-output'
  | 'prepare-failed';

/** v0.4.4：把錯誤分類包成自訂 error，UI 用 instanceof + code 顯示對應訊息 */
export class PngExportError extends Error {
  readonly code: PngExportErrorCode;
  readonly cause?: unknown;
  constructor(code: PngExportErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'PngExportError';
    this.code = code;
    this.cause = cause;
  }
}

/** v0.4.4：把 PngExportErrorCode 轉成中文友善訊息（給 toast / dialog 用） */
export function describePngExportError(code: PngExportErrorCode): {
  title: string;
  description: string;
} {
  switch (code) {
    case 'fallback-failed':
      return {
        title: 'PNG 匯出失敗（截圖引擎異常）',
        description:
          '主流程 html2canvas 與備援 html-to-image 都失敗，可能是樣式中含有不支援的 CSS（例如 oklch / 自訂 filter）；請改用「複製 HTML」或「下載 HTML」匯出。',
      };
    case 'empty-output':
      return {
        title: 'PNG 匯出失敗（產出空檔）',
        description: '截圖完成但回傳空的圖片，請重試一次；若仍失敗，建議改用「下載 HTML」匯出。',
      };
    case 'prepare-failed':
      return {
        title: 'PNG 匯出失敗（資料準備）',
        description: 'EDM 內容無法序列化為截圖容器，請檢查內容是否完整後再試。',
      };
  }
}

/** v0.4.4：給 toast 用的階段中文文案（caller 可選用） */
export function describePngExportPhase(phase: PngExportPhase): string {
  switch (phase) {
    case 'preparing':
      return '正在準備 EDM HTML…';
    case 'preload-images':
      return '正在預載入並嵌入圖片…';
    case 'rendering':
      return '正在繪製截圖（html2canvas）…';
    case 'fallback-rendering':
      return '主流程失敗，改用備援引擎（html-to-image）…';
    case 'finalizing':
      return '截圖完成，準備下載…';
  }
}

export interface ExportPngOptions {
  /** v0.4.4：階段進度回呼，UI 可以更新 toast 文案 */
  onProgress?: (phase: PngExportPhase) => void;
  /**
   * v0.5.2：宿主接管 blob 處理。
   *
   * 回傳 `true` 表示「我已自行處理（例：上傳到 R2 + 寫 DB）」，exportPng 會跳過
   * 預設的 downloadBlob 流程。回傳 `false`/`undefined`/拋錯則走預設下載。
   *
   * caller 不需要在這裡 try-catch；攔截器拋錯會被外層捕捉並包成
   * `PngExportError('fallback-failed' as 通常代表 hook 失敗)`，但這個 hook 的錯誤
   * 不會吃掉「主流程其實成功」的 blob —— 仍會 fallthrough 至預設下載。
   */
  onBlob?: (blob: Blob, filename: string) => boolean | undefined | Promise<boolean | undefined>;
}

export async function exportPng(
  filename: string,
  props: EmailTemplateProps,
  options: ExportPngOptions = {},
): Promise<void> {
  const { onProgress, onBlob } = options;
  const reportProgress = (phase: PngExportPhase): void => {
    try {
      onProgress?.(phase);
    } catch {
      // 進度回呼絕不可影響主流程
    }
  };

  reportProgress('preparing');
  let html: string;
  try {
    html = await renderEdmHtml(props, { pretty: false });
  } catch (err) {
    throw new PngExportError('prepare-failed', 'EDM HTML 序列化失敗', err);
  }
  const bgColor = props.tokens.bg || '#ffffff';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    `width:${EDM_INNER_WIDTH + EXPORT_PADDING * 2}px`,
    `padding:${EXPORT_PADDING}px`,
    'box-sizing:border-box',
    `background:${bgColor}`,
    'z-index:-1',
    'pointer-events:none',
    // 關鍵：用 transform 移到視窗外即可，不能用 opacity:0
    // （opacity:0 會被 html2canvas 套用到根節點，導致截出來的 PNG 整張透明）
    'transform:translate(-200vw, 0)',
  ].join(';');

  const inner = document.createElement('div');
  inner.style.cssText = `width:${EDM_INNER_WIDTH}px;margin:0 auto;background:${bgColor};`;

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const innerHtml = bodyMatch ? bodyMatch[1] : html;
  inner.innerHTML = sanitizeForCapture(innerHtml);

  wrapper.appendChild(inner);

  reportProgress('preload-images');
  await preloadAndInlineImages(wrapper);

  document.body.appendChild(wrapper);

  await waitForImages(wrapper);
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  await new Promise((r) => setTimeout(r, 150));

  try {
    const width = wrapper.offsetWidth;
    const height = Math.max(wrapper.scrollHeight, wrapper.offsetHeight, 200);

    let blob: Blob | null = null;
    let primaryError: unknown = null;

    reportProgress('rendering');
    try {
      const canvas = await html2canvas(wrapper, {
        backgroundColor: bgColor,
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        width,
        height,
        windowWidth: width,
        windowHeight: height,
      });
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png'),
      );
    } catch (e1) {
      primaryError = e1;
      console.warn('[exportPng] html2canvas failed, falling back to html-to-image:', e1);
      reportProgress('fallback-rendering');
      try {
        const dataUrl = await htmlToImage.toPng(wrapper, {
          pixelRatio: 2,
          backgroundColor: bgColor,
          width,
          height,
          cacheBust: false,
          skipFonts: true,
          imagePlaceholder: TRANSPARENT_PX,
          style: { width: `${width}px`, height: `${height}px` },
          filter: (node) => {
            if (!(node instanceof Element)) return true;
            const tag = node.tagName?.toLowerCase();
            return tag !== 'script' && tag !== 'noscript';
          },
        });
        blob = await (await fetch(dataUrl)).blob();
      } catch (e2) {
        // 兩條路徑都失敗 → fallback-failed（保留 e2 為 cause，e1 印出來輔助診斷）
        throw new PngExportError(
          'fallback-failed',
          '主流程與備援流程都無法產生 PNG',
          { primary: primaryError, fallback: e2 },
        );
      }
    }

    if (!blob) {
      // 進到這裡代表沒 throw，但 toBlob / fetch 回傳了 null/empty
      throw new PngExportError('empty-output', '截圖產生空白檔案');
    }
    reportProgress('finalizing');

    // v0.5.2：先給宿主一次接管機會，攔截器回 true 就跳過預設下載
    let handled = false;
    if (onBlob) {
      try {
        const r = await onBlob(blob, filename);
        handled = r === true;
      } catch (e) {
        console.warn('[exportPng] onBlob hook threw, falling back to default download:', e);
      }
    }
    if (!handled) {
      downloadBlob(blob, filename);
    }
  } finally {
    wrapper.remove();
  }
}

function sanitizeForCapture(html: string): string {
  return html.replace(/<img\b([^>]*)>/gi, (match, attrs: string) => {
    const srcMatch = attrs.match(/\bsrc\s*=\s*("([^"]*)"|'([^']*)')/i);
    const src = srcMatch ? srcMatch[2] ?? srcMatch[3] ?? '' : '';
    if (!src.trim() || src.trim() === '#') {
      return '';
    }
    return match;
  });
}

async function preloadAndInlineImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    imgs.map(async (img) => {
      const original = img.getAttribute('src') ?? '';
      if (!original || original.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
        return;
      }
      img.crossOrigin = 'anonymous';
      try {
        const dataUrl = await fetchImageAsDataUrl(original);
        img.src = dataUrl;
      } catch (err) {
        console.warn('[exportPng] image fetch failed, replacing with placeholder:', original, err);
        img.src = TRANSPARENT_PX;
      }
    }),
  );
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalHeight > 0) {
            resolve();
            return;
          }
          const done = (): void => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          setTimeout(done, 8000);
        }),
    ),
  );
}
