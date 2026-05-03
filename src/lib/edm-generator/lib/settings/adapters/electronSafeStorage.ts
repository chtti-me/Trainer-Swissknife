/**
 * v0.5.1：ElectronSafeStorageAdapter —— 桌面版預設實作。
 *
 * 走 `window.edm.setSecret/getSecret/deleteSecret`，由 Electron main process
 * 的 `safeStorage` API 加密儲存於 OS 安全區（DPAPI on Windows / Keychain on macOS）。
 *
 * 注意：建構時不檢查 `window.edm`，因為 caller 端（registry）會先用 `isElectron()`
 *      判斷再決定要不要 new 這個 adapter；若未來真的有人在非 Electron 環境直接 new，
 *      呼叫時會自然 throw（`window.edm.setSecret is not a function`）。
 */

import type { SettingsAdapter } from '../adapter';

export class ElectronSafeStorageAdapter implements SettingsAdapter {
  async getSecret(key: string): Promise<string> {
    const r = await window.edm.getSecret(key);
    return r.value ?? '';
  }

  async setSecret(key: string, value: string): Promise<void> {
    await window.edm.setSecret(key, value);
  }

  async deleteSecret(key: string): Promise<void> {
    await window.edm.deleteSecret(key);
  }

  supportsApiKeyUI(): boolean {
    return true;
  }

  describe(): { name: string } {
    return { name: 'Electron safeStorage（OS 加密）' };
  }
}
