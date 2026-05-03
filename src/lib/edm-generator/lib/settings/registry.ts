/**
 * v0.5.1：SettingsAdapter Registry —— 全域注入點，與 AI registry 對稱。
 *
 * 預設：偵測環境（Electron / 瀏覽器）lazy 建立對應 adapter。
 *
 * 整合：宿主應用（瑞士刀 Next.js root）啟動時呼叫一次
 *   `setSettingsAdapter(new NoopSettingsAdapter())`，之後所有 API Key 相關
 *   UI 與 storage 自動隱藏 / no-op。
 */

import { isElectron } from '@edm/lib/utils';
import type { SettingsAdapter } from './adapter';
import { NoopSettingsAdapter } from './adapter';
import { ElectronSafeStorageAdapter } from './adapters/electronSafeStorage';
import { LocalStorageBrowserAdapter } from './adapters/localStorageBrowser';

let injected: SettingsAdapter | null = null;
let lazyDefault: SettingsAdapter | null = null;

/**
 * 取得目前全域 SettingsAdapter；沒注入過就回傳預設（依環境）：
 *   - Electron → ElectronSafeStorageAdapter
 *   - 瀏覽器（有 localStorage）→ LocalStorageBrowserAdapter
 *   - SSR / Node / 測試 → NoopSettingsAdapter
 */
export function getSettingsAdapter(): SettingsAdapter {
  if (injected) return injected;
  if (!lazyDefault) {
    if (isElectron()) {
      lazyDefault = new ElectronSafeStorageAdapter();
    } else if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        // 試寫一次（隱私模式可能會丟）
        window.localStorage.setItem('__edm_settings_test__', '1');
        window.localStorage.removeItem('__edm_settings_test__');
        lazyDefault = new LocalStorageBrowserAdapter();
      } catch {
        lazyDefault = new NoopSettingsAdapter();
      }
    } else {
      lazyDefault = new NoopSettingsAdapter();
    }
  }
  return lazyDefault;
}

/**
 * 注入自訂 SettingsAdapter（瑞士刀整合用）。
 * 傳 `null` 還原為預設偵測。
 */
export function setSettingsAdapter(adapter: SettingsAdapter | null): void {
  injected = adapter;
}

/** 測試專用 */
export function _resetSettingsAdapter(): void {
  injected = null;
  lazyDefault = null;
}
