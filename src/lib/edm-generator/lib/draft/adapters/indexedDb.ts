/**
 * v0.7.5.0：IndexedDbDraftStorage —— 瀏覽器版 autosave 後端。
 *
 * # 為什麼用 IndexedDB 而不是 localStorage
 *
 *   localStorage 上限 5 MB（同步、字串）；單張 hero image Base64 1 MB 起跳，加上
 *   instructor avatar Base64 + 多張 image block + 其他 state，5 MB 撐不住。
 *   IndexedDB 配額為硬碟空間 60% 上限（dozens of GB），且 async 不阻塞 UI thread。
 *
 *   `idb-keyval` 是 IndexedDB 最薄的封裝（~1.5 KB gzipped，無依賴），API 與
 *   localStorage 一樣 set/get/del；不為了 autosave 引入 Dexie 等重量級 ORM。
 *
 * # key 選擇
 *
 *   `edm.draft.v1` —— 含 schema major 版本前綴，未來 bump 時可以平行讀新舊兩個 key
 *   做遷移（雖然目前的策略是 incompatible 直接丟棄）。
 */

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type { DraftStorageAdapter } from '../adapter';
import { CURRENT_DRAFT_VERSION, type DraftPayload, type DraftReadResult } from '../types';

const DRAFT_KEY = 'edm.draft.v1';

export class IndexedDbDraftStorage implements DraftStorageAdapter {
  async read(): Promise<DraftReadResult> {
    try {
      const raw = await idbGet<unknown>(DRAFT_KEY);
      if (raw == null) return { status: 'empty' };

      // idb-keyval 直接存 object，但保險起見也 accept 字串（萬一外部寫過字串）
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;

      if (!obj || typeof obj !== 'object') {
        return { status: 'corrupt', error: 'payload not an object' };
      }
      const v = (obj as { version?: unknown }).version;
      if (typeof v !== 'number') {
        return { status: 'corrupt', error: 'missing version field' };
      }
      if (v !== CURRENT_DRAFT_VERSION) {
        return { status: 'incompatible', rawVersion: v };
      }
      // schema 對；至少要有 snapshot + savedAt
      const payload = obj as Partial<DraftPayload>;
      if (!payload.snapshot || typeof payload.savedAt !== 'number') {
        return { status: 'corrupt', error: 'missing snapshot/savedAt' };
      }
      return { status: 'ok', payload: payload as DraftPayload };
    } catch (err) {
      return { status: 'corrupt', error: (err as Error).message };
    }
  }

  async write(payload: DraftPayload): Promise<void> {
    // idb-keyval 直接存 object 即可，瀏覽器內部用結構化複製演算法序列化
    await idbSet(DRAFT_KEY, payload);
  }

  async clear(): Promise<void> {
    await idbDel(DRAFT_KEY);
  }

  describe(): { name: string; supportsAutosave: boolean } {
    return { name: 'IndexedDB（瀏覽器自動存檔）', supportsAutosave: true };
  }
}
