import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).edm?.isElectron;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(text: string, asHtml = false): Promise<void> {
  if (isElectron()) {
    if (asHtml) await window.edm.copyHTML(text);
    else await window.edm.copyText(text);
    return;
  }

  if (asHtml && typeof ClipboardItem !== 'undefined') {
    // 同時寫入 text/html（給 Outlook / Word / 郵件客戶端 → 渲染為 rich text）
    // 與 text/plain（給 VS Code / 聊天視窗 / Notepad → 看到 HTML 原始碼字串）
    // ⚠️ 不要把 plain text 設成 strip 過 tag 的版本，否則貼到純文字接收方就只剩文字殘骸，
    // 完全不符合「複製 HTML」按鈕的字面意涵。
    const data = [
      new ClipboardItem({
        'text/html': new Blob([text], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ];
    await navigator.clipboard.write(data);
  } else {
    await navigator.clipboard.writeText(text);
  }
}
