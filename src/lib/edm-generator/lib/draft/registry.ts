/**
 * v0.7.5.0：DraftStorageAdapter Registry —— 全域注入點，與 AI / Settings registry 對稱。
 *
 * 預設偵測：
 *   - Electron（`window.edm.isElectron === true` 且 `window.edm.draft` 存在）→ ElectronFsDraftStorage
 *   - 瀏覽器（有 indexedDB API）→ IndexedDbDraftStorage
 *   - 都不符合 → NoopDraftStorageAdapter（autosave 自動關閉，不影響其他功能）
 *
 * 整合層注入：
 *   `setDraftStorageAdapter(new NoopDraftStorageAdapter())` 強制關掉 autosave
 *   （宿主自己存草稿到他們的後端）
 */

import { isElectron } from '@edm/lib/utils';
import type { DraftStorageAdapter } from './adapter';
import { NoopDraftStorageAdapter } from './adapter';
import { ElectronFsDraftStorage } from './adapters/electronFs';
import { IndexedDbDraftStorage } from './adapters/indexedDb';

let injected: DraftStorageAdapter | null = null;
let lazyDefault: DraftStorageAdapter | null = null;

export function getDraftStorageAdapter(): DraftStorageAdapter {
  if (injected) return injected;
  if (!lazyDefault) {
    if (isElectron() && (window as { edm?: { draft?: unknown } }).edm?.draft) {
      lazyDefault = new ElectronFsDraftStorage();
    } else if (typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined') {
      lazyDefault = new IndexedDbDraftStorage();
    } else {
      lazyDefault = new NoopDraftStorageAdapter();
    }
  }
  return lazyDefault;
}

/** 整合層注入；傳 null 還原預設偵測 */
export function setDraftStorageAdapter(adapter: DraftStorageAdapter | null): void {
  injected = adapter;
}

/** 測試專用 */
export function _resetDraftStorageAdapter(): void {
  injected = null;
  lazyDefault = null;
}
