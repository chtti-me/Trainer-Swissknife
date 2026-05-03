/**
 * v0.4.2：模組持久化 adapter。
 *
 * 抽象介面：
 *   - LocalStorageModuleStorage：browser / Electron renderer 用（透過 window.localStorage）
 *   - InMemoryModuleStorage：Node 測試 / SSR / fallback 用
 *   - createDefaultModuleStorage()：偵測環境回傳對的 adapter
 *
 * 全部介面都是 async（Promise-based），讓未來換成 Electron fs / IndexedDB 不需改 caller。
 */

import type { SavedModule } from '@edm/types/savedModule';
import { deserializeModules, serializeModules } from './helpers';

const STORAGE_KEY = 'edm-generator.modules.v1';

export interface ModuleStorage {
  list(): Promise<SavedModule[]>;
  save(m: SavedModule): Promise<void>;
  remove(id: string): Promise<void>;
  /**
   * 把指定 modules 序列化成 JSON 字串。
   * 若 ids 為 undefined 表示全部。
   */
  exportJson(ids?: string[]): Promise<string>;
  /**
   * 從 JSON 字串匯入 modules。
   * 預設「同 id 跳過」，避免覆蓋使用者既有資料；caller 可以在跳過後另外用 generate-new-id 模式重新匯入。
   */
  importJson(
    json: string,
    opts?: { onConflict?: 'skip' | 'overwrite' | 'rename' },
  ): Promise<{ imported: number; skipped: number; errors: string[] }>;
}

/** ---------------- LocalStorage 實作 ---------------- */

export class LocalStorageModuleStorage implements ModuleStorage {
  constructor(private readonly storage: Storage = window.localStorage) {}

  async list(): Promise<SavedModule[]> {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const result = deserializeModules(raw);
    return result.modules;
  }

  async save(m: SavedModule): Promise<void> {
    const all = await this.list();
    const idx = all.findIndex((x) => x.id === m.id);
    if (idx >= 0) all[idx] = m;
    else all.push(m);
    this.storage.setItem(STORAGE_KEY, serializeModules(all));
  }

  async remove(id: string): Promise<void> {
    const all = await this.list();
    const next = all.filter((m) => m.id !== id);
    this.storage.setItem(STORAGE_KEY, serializeModules(next));
  }

  async exportJson(ids?: string[]): Promise<string> {
    const all = await this.list();
    const subset = ids ? all.filter((m) => ids.includes(m.id)) : all;
    return serializeModules(subset);
  }

  async importJson(
    json: string,
    opts: { onConflict?: 'skip' | 'overwrite' | 'rename' } = {},
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const onConflict = opts.onConflict ?? 'skip';
    const result = deserializeModules(json);
    const all = await this.list();
    const existingIds = new Set(all.map((m) => m.id));

    let imported = 0;
    let skipped = 0;
    for (const m of result.modules) {
      if (existingIds.has(m.id)) {
        if (onConflict === 'skip') {
          skipped++;
          continue;
        }
        if (onConflict === 'rename') {
          // 給新 id；確保不重
          const newId = `${m.id}-imp${Date.now().toString(36).slice(-4)}`;
          all.push({ ...m, id: newId });
          existingIds.add(newId);
          imported++;
          continue;
        }
        // overwrite：找到位置取代
        const idx = all.findIndex((x) => x.id === m.id);
        all[idx] = m;
        imported++;
      } else {
        all.push(m);
        existingIds.add(m.id);
        imported++;
      }
    }

    this.storage.setItem(STORAGE_KEY, serializeModules(all));
    return { imported, skipped, errors: result.errors };
  }
}

/** ---------------- In-memory 實作（測試 / fallback） ---------------- */

export class InMemoryModuleStorage implements ModuleStorage {
  private modules: SavedModule[] = [];

  async list(): Promise<SavedModule[]> {
    // 回傳 copy，避免 caller 直接 mutate 我們內部 state
    return this.modules.map((m) => ({ ...m }));
  }

  async save(m: SavedModule): Promise<void> {
    const idx = this.modules.findIndex((x) => x.id === m.id);
    if (idx >= 0) this.modules[idx] = m;
    else this.modules.push(m);
  }

  async remove(id: string): Promise<void> {
    this.modules = this.modules.filter((m) => m.id !== id);
  }

  async exportJson(ids?: string[]): Promise<string> {
    const subset = ids ? this.modules.filter((m) => ids.includes(m.id)) : this.modules;
    return serializeModules(subset);
  }

  async importJson(
    json: string,
    opts: { onConflict?: 'skip' | 'overwrite' | 'rename' } = {},
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const onConflict = opts.onConflict ?? 'skip';
    const result = deserializeModules(json);
    const existingIds = new Set(this.modules.map((m) => m.id));

    let imported = 0;
    let skipped = 0;
    for (const m of result.modules) {
      if (existingIds.has(m.id)) {
        if (onConflict === 'skip') {
          skipped++;
          continue;
        }
        if (onConflict === 'rename') {
          const newId = `${m.id}-imp${Date.now().toString(36).slice(-4)}`;
          this.modules.push({ ...m, id: newId });
          existingIds.add(newId);
          imported++;
          continue;
        }
        const idx = this.modules.findIndex((x) => x.id === m.id);
        this.modules[idx] = m;
        imported++;
      } else {
        this.modules.push(m);
        existingIds.add(m.id);
        imported++;
      }
    }
    return { imported, skipped, errors: result.errors };
  }
}

/** 偵測環境並回傳合適的 adapter */
export function createDefaultModuleStorage(): ModuleStorage {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      // 試寫一次（隱私模式可能會丟）
      window.localStorage.setItem('__edm_storage_test__', '1');
      window.localStorage.removeItem('__edm_storage_test__');
      return new LocalStorageModuleStorage();
    } catch {
      // ignore，fallback
    }
  }
  return new InMemoryModuleStorage();
}
