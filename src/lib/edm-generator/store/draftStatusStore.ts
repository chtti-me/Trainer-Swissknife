/**
 * v0.7.5.0：DraftStatusStore —— 給 UI 顯示「最後儲存：5 秒前」/「儲存失敗」用。
 *
 * 與 edmStore 分離的原因：
 *   - 寫入時間 / 錯誤狀態屬於 IO meta，不該汙染文件 snapshot
 *   - footer indicator subscribe 這個 store 即可，不會因 edmStore 任何變更都 re-render
 *
 * # 為什麼不放 uiStore
 *
 *   uiStore 是「面板開合 / 全螢幕」這種純 UI 偏好；draftStatus 是 IO 狀態，
 *   生命週期完全不同（每次 autosave 寫入都會 update），合在一起語意混淆。
 */

import { create } from 'zustand';

/**
 * autosave 流程的有限狀態：
 *   - idle：剛啟動 / 還沒第一次寫入
 *   - saving：debounce flush 中 / IPC 寫入中
 *   - saved：上次 write 成功，附 timestamp 給 indicator 算「N 秒前」
 *   - error：上次 write 失敗，附錯誤訊息
 *   - disabled：adapter 是 Noop / 環境不支援，footer 顯示「未啟用自動存檔」
 */
export type DraftStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; savedAt: number }
  | { kind: 'error'; error: string; lastSavedAt: number | null }
  | { kind: 'disabled' };

interface DraftStatusState {
  status: DraftStatus;
  /** 啟動時還原來源；給 toast / dev 訊息用 */
  restoredFrom: 'none' | 'autosave' | 'host';
  setSaving: () => void;
  setSaved: (savedAt: number) => void;
  setError: (error: string) => void;
  setDisabled: () => void;
  setRestoredFrom: (origin: 'none' | 'autosave' | 'host') => void;
}

export const useDraftStatusStore = create<DraftStatusState>((set, get) => ({
  status: { kind: 'idle' },
  restoredFrom: 'none',
  setSaving: () => set({ status: { kind: 'saving' } }),
  setSaved: (savedAt) => set({ status: { kind: 'saved', savedAt } }),
  setError: (error) => {
    const prev = get().status;
    const lastSavedAt =
      prev.kind === 'saved' ? prev.savedAt :
      prev.kind === 'error' ? prev.lastSavedAt :
      null;
    set({ status: { kind: 'error', error, lastSavedAt } });
  },
  setDisabled: () => set({ status: { kind: 'disabled' } }),
  setRestoredFrom: (origin) => set({ restoredFrom: origin }),
}));
