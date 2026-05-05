/**
 * 【課程規劃報告產生器 - 共用工具】
 */
import { nanoid } from "nanoid";

/** 短 ID（8 字，用於 canvas blocks 與 sessions） */
export const newId = (): string => nanoid(8);

/** 取得目前時間 ISO 字串 */
export const nowIso = (): string => new Date().toISOString();

/** 民國年 */
export function rocYear(date: Date = new Date()): number {
  return date.getFullYear() - 1911;
}

/** 把 Blob 讀成 base64 字串（不含 data: prefix） */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** 把 Blob 轉成 dataURL（含 prefix） */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** 取得檔案副檔名（小寫，不含「.」） */
export function getExt(filename: string): string {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m?.[1] ?? "";
}

/** 是否為圖片副檔名 */
export function isImageExt(ext: string): boolean {
  return ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext.toLowerCase());
}

/** 是否為文件類型副檔名（可送 server parse） */
export function isDocExt(ext: string): boolean {
  return ["txt", "docx", "pdf", "xlsx", "csv", "html", "htm"].includes(ext.toLowerCase());
}

/** debounce 工具（client-side） */
export function debounce<T extends (...args: unknown[]) => void>(fn: T, wait: number): T & { cancel: () => void } {
  let t: ReturnType<typeof setTimeout> | null = null;
  const wrapped = ((...args: unknown[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...(args as Parameters<T>)), wait);
  }) as T & { cancel: () => void };
  wrapped.cancel = () => {
    if (t) clearTimeout(t);
    t = null;
  };
  return wrapped;
}

/** 把檔名清理成可作為下載檔名的字串 */
export function sanitizeFilename(s: string, maxLen = 60): string {
  return (s || "未命名")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim()
    .slice(0, maxLen);
}

/** 安全解析 number（給 input value 用） */
export function safeNum(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
}
