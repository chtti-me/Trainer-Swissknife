/**
 * v0.4.2：模組庫 Zustand store。
 *
 * 內部維護一份 modules 陣列 cache，所有 mutation（save / remove / import）都同步寫回 storage。
 * Component 直接訂閱 modules array 即可，不需要每次都 await storage.list()。
 *
 * 由 App 入口呼叫一次 `initModules(storage)` 完成初始化（從 storage 讀進 cache）。
 */

import { create } from 'zustand';
import type { Block } from '@edm/types/blocks';
import type { SavedModule } from '@edm/types/savedModule';
import type { ModuleStorage } from '@edm/lib/modules/storage';
import { createDefaultModuleStorage } from '@edm/lib/modules/storage';
import { buildModuleFromBlocks, instantiateModule } from '@edm/lib/modules/helpers';

/**
 * v0.4.2.1：「請求儲存」的 pending state。
 *
 * 多個 UI 入口（ModulesPanel 的「存選中區塊」按鈕、EditableCanvas 浮動 toolbar 的
 * 「存入模組庫」icon、未來右鍵選單等）都呼叫 `requestSaveBlocks(blocks, source)`，
 * 由全域 mount 的 SaveModuleDialog 訂閱 `pendingSaveRequest` 開啟自己。
 *
 * 用 store state 而非 React Context 的好處：
 *   - 不需要在 App 樹中加 Provider
 *   - Zustand store 已經是單例，subscribers 會自動 re-render
 *   - 直接從事件 handler 觸發（不需 useContext hook）
 */
export interface PendingSaveRequest {
  /** 要儲存的 blocks 序列（caller 自己決定要存哪些） */
  blocks: Block[];
  /** 從哪裡觸發的（給 dialog 顯示不同預設名稱與說明） */
  source: 'single-block' | 'selected' | 'all';
  /** 預設名稱（caller 可以指定，避免 dialog 用 generic「自訂模組」） */
  defaultName?: string;
}

interface ModulesState {
  modules: SavedModule[];
  loaded: boolean;
  storage: ModuleStorage;

  /** v0.4.2.1：被任何 UI 呼叫後，全域 SaveModuleDialog 會被觸發 */
  pendingSaveRequest: PendingSaveRequest | null;

  /** App 入口呼叫一次，從 storage 讀取現有資料 */
  init: (storage?: ModuleStorage) => Promise<void>;

  /** 從一段 blocks 建一個模組存進去；回傳新模組 */
  saveAsModule: (
    blocks: Block[],
    opts: { name: string; description?: string; tags?: string[] },
  ) => Promise<SavedModule>;

  /** 直接存一個現成的 module（給「匯入」或「更新既有」用） */
  saveModule: (m: SavedModule) => Promise<void>;

  /**
   * v0.4.4：重新命名一個已存模組。
   *
   * 規則：
   *   - newName trim 後必須非空，否則 throw（避免存空字串造成列表混亂）
   *   - 找不到 id 時 silent no-op（避免被外部呼叫時資料剛好被刪掉的競態）
   *   - 同步 updatedAt 為當下 ISO 時間，方便將來顯示「最近編輯」排序
   */
  renameModule: (id: string, newName: string) => Promise<void>;

  /**
   * v0.4.4：更新一個已存模組的 tags（取代整組）。
   *
   * 規則：
   *   - tags 中為空字串 / 純空白會被過濾掉
   *   - 自動 dedupe（相同字串只留一份）
   *   - 找不到 id 時 silent no-op
   */
  updateModuleTags: (id: string, tags: string[]) => Promise<void>;

  /** 刪除一個模組 */
  removeModule: (id: string) => Promise<void>;

  /** 把模組實例化成 blocks（id 全部換新；origin 設為 user） */
  instantiateModuleBlocks: (id: string) => Block[] | null;

  /** 匯出 JSON 字串（沒指定 ids 表示全部） */
  exportJson: (ids?: string[]) => Promise<string>;

  /** 匯入 JSON */
  importJson: (
    json: string,
    opts?: { onConflict?: 'skip' | 'overwrite' | 'rename' },
  ) => Promise<{ imported: number; skipped: number; errors: string[] }>;

  /** v0.4.2.1：請求把指定 blocks 存成模組（會觸發全域 SaveModuleDialog） */
  requestSaveBlocks: (req: PendingSaveRequest) => void;

  /** v0.4.2.1：clear 掉 pending request（dialog 關閉時呼叫） */
  clearSaveRequest: () => void;
}

export const useModulesStore = create<ModulesState>((set, get) => ({
  modules: [],
  loaded: false,
  pendingSaveRequest: null,
  // 預設 in-memory；init() 時會被 LocalStorage 取代（瀏覽器中）
  storage: createDefaultModuleStorage(),

  init: async (storage) => {
    const s = storage ?? get().storage;
    const modules = await s.list();
    set({ modules, loaded: true, storage: s });
  },

  saveAsModule: async (blocks, opts) => {
    const m = buildModuleFromBlocks(blocks, opts);
    await get().storage.save(m);
    set({ modules: [...get().modules, m] });
    return m;
  },

  saveModule: async (m) => {
    await get().storage.save(m);
    const all = await get().storage.list();
    set({ modules: all });
  },

  renameModule: async (id, newName) => {
    const trimmed = newName.trim();
    if (!trimmed) throw new Error('模組名稱不可為空');
    const target = get().modules.find((m) => m.id === id);
    if (!target) return;
    const updated: SavedModule = {
      ...target,
      name: trimmed,
      updatedAt: new Date().toISOString(),
    };
    await get().storage.save(updated);
    set({
      modules: get().modules.map((m) => (m.id === id ? updated : m)),
    });
  },

  updateModuleTags: async (id, tags) => {
    const target = get().modules.find((m) => m.id === id);
    if (!target) return;
    const cleaned = Array.from(
      new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0)),
    );
    const updated: SavedModule = {
      ...target,
      tags: cleaned,
      updatedAt: new Date().toISOString(),
    };
    await get().storage.save(updated);
    set({
      modules: get().modules.map((m) => (m.id === id ? updated : m)),
    });
  },

  removeModule: async (id) => {
    await get().storage.remove(id);
    set({ modules: get().modules.filter((m) => m.id !== id) });
  },

  instantiateModuleBlocks: (id) => {
    const m = get().modules.find((x) => x.id === id);
    if (!m) return null;
    return instantiateModule(m);
  },

  exportJson: (ids) => get().storage.exportJson(ids),

  importJson: async (json, opts) => {
    const result = await get().storage.importJson(json, opts);
    const all = await get().storage.list();
    set({ modules: all });
    return result;
  },

  requestSaveBlocks: (req) => {
    set({ pendingSaveRequest: req });
  },

  clearSaveRequest: () => {
    set({ pendingSaveRequest: null });
  },
}));
