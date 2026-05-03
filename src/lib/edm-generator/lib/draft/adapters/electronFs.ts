/**
 * v0.7.5.0：ElectronFsDraftStorage —— Electron 桌面版 autosave 後端。
 *
 * 透過 `window.edm.draft.*` IPC 寫到 main process 的 `app.getPath('userData')/autosave.json`
 * （平台對應路徑：Windows `%APPDATA%/edm-generator/`、macOS `~/Library/Application Support/edm-generator/`、
 *  Linux `~/.config/edm-generator/`）。
 *
 * # 為什麼不用 IndexedDB（即使 Electron 內也有）
 *
 *   1) 檔案系統 dump 對使用者最透明：當機後使用者可以直接去那個資料夾把 JSON 撈出來
 *      —— 培訓師很在意「就算系統爆了我的作品也能撈回來」
 *   2) Electron 內 IndexedDB 跟 Chromium 版本綁定，App 升級換 Chromium 偶爾會丟資料
 *   3) 檔案系統儲存量 = 硬碟，不會撞到 IndexedDB 配額
 *   4) 容易做後續「另存新檔到指定位置」/「從檔案還原」等延伸功能
 *
 * # 失敗策略
 *
 *   - `window.edm` 不存在（不是 Electron 但卻誤注入）→ throw（caller 應該 fallback）
 *   - IPC 回傳 ok=false → throw（footer indicator 顯示「儲存失敗」）
 */

import type { DraftStorageAdapter } from '../adapter';
import { CURRENT_DRAFT_VERSION, type DraftPayload, type DraftReadResult } from '../types';

interface DraftIpcResult {
  ok: boolean;
  /** read 時：null = 檔案不存在；string = JSON 字串 */
  content?: string | null;
  error?: string;
}

interface DraftIpcApi {
  read(): Promise<DraftIpcResult>;
  write(content: string): Promise<DraftIpcResult>;
  clear(): Promise<DraftIpcResult>;
}

function getApi(): DraftIpcApi | null {
  const edm = (typeof window !== 'undefined' ? (window as { edm?: { draft?: DraftIpcApi } }).edm : null);
  return edm?.draft ?? null;
}

export class ElectronFsDraftStorage implements DraftStorageAdapter {
  async read(): Promise<DraftReadResult> {
    const api = getApi();
    if (!api) return { status: 'corrupt', error: 'window.edm.draft not available' };
    try {
      const result = await api.read();
      if (!result.ok) return { status: 'corrupt', error: result.error ?? 'IPC read failed' };
      if (result.content == null) return { status: 'empty' };

      const obj = JSON.parse(result.content);
      if (!obj || typeof obj !== 'object') {
        return { status: 'corrupt', error: 'payload not an object' };
      }
      const v = obj.version;
      if (typeof v !== 'number') {
        return { status: 'corrupt', error: 'missing version field' };
      }
      if (v !== CURRENT_DRAFT_VERSION) {
        return { status: 'incompatible', rawVersion: v };
      }
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
    const api = getApi();
    if (!api) throw new Error('window.edm.draft not available');
    const result = await api.write(JSON.stringify(payload));
    if (!result.ok) throw new Error(result.error ?? 'IPC write failed');
  }

  async clear(): Promise<void> {
    const api = getApi();
    if (!api) throw new Error('window.edm.draft not available');
    const result = await api.clear();
    if (!result.ok) throw new Error(result.error ?? 'IPC clear failed');
  }

  describe(): { name: string; supportsAutosave: boolean } {
    return { name: 'Electron 檔案系統（userData/autosave.json）', supportsAutosave: true };
  }
}
