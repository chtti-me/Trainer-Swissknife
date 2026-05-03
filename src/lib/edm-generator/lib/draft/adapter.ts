/**
 * v0.7.5.0：DraftStorageAdapter —— autosave 後端抽象。
 *
 * # 為什麼仿 SettingsAdapter 模式
 *
 *   1) Electron 與瀏覽器寫入路徑天生不同：
 *      - Electron：透過 IPC 寫到 `app.getPath('userData')/autosave.json`（檔案系統，最穩定）
 *      - 瀏覽器：IndexedDB（容量遠超 localStorage 5MB，能裝 hero Base64 + 多張 image block）
 *
 *   2) 整合進培訓師瑞士刀（Trainer Swiss Knife）時：
 *      - 宿主應用可能想自己管理 draft（存到他們的 Postgres / Supabase）
 *      - 注入 NoopDraftStorageAdapter 或自訂 adapter 即可關閉 / 改寫
 *
 *   3) 與既有 SettingsAdapter / AiAdapter 三套 registry 對稱，認知成本最低。
 *
 * # 介面設計：read / write / clear 三個方法
 *
 * 不提供 list / multi-key —— 目前只支援「一份草稿」（最後一次未存檔的工作）。
 * 未來要做「多份具名草稿」可以用 `key` 參數擴充而不破壞 v1 API。
 */

import type { DraftPayload, DraftReadResult } from './types';

export interface DraftStorageAdapter {
  /** 讀取目前 draft；空 / 損壞 / 不相容 / 正常 四種結果由 caller 決定如何處理 */
  read(): Promise<DraftReadResult>;

  /** 寫入 draft；同步寫入失敗應 throw（caller 透過 try/catch 顯示「儲存失敗」toast） */
  write(payload: DraftPayload): Promise<void>;

  /** 清空 draft（使用者按「捨棄並從頭開始」/ 完成 EDM 後手動清空時用） */
  clear(): Promise<void>;

  /** 自我描述（給 footer indicator + log 顯示） */
  describe(): { name: string; supportsAutosave: boolean };
}

/**
 * SSR / 不支援的環境用：所有方法都 no-op，read 永遠回 empty。
 *
 * 也是「宿主關閉 autosave」的注入選項：
 *   `setDraftStorageAdapter(new NoopDraftStorageAdapter())`
 */
export class NoopDraftStorageAdapter implements DraftStorageAdapter {
  async read(): Promise<DraftReadResult> {
    return { status: 'empty' };
  }
  async write(): Promise<void> {
    // no-op
  }
  async clear(): Promise<void> {
    // no-op
  }
  describe(): { name: string; supportsAutosave: boolean } {
    return { name: 'Noop（autosave disabled）', supportsAutosave: false };
  }
}
