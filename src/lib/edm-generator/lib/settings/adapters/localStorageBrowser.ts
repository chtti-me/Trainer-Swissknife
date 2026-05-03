/**
 * v0.5.1：LocalStorageBrowserAdapter —— 瀏覽器版（純 web）預設實作。
 *
 * 走 window.localStorage。空值會直接 removeItem，避免儲存空字串造成
 * 「key 存在但值為空」的偽存在狀態。
 *
 * 警告：localStorage 是明文，部署於公開網域時應 prefer 走 server proxy
 *      （注入 NoopSettingsAdapter + serverProxyAiAdapter）。
 */

import type { SettingsAdapter } from '../adapter';

export class LocalStorageBrowserAdapter implements SettingsAdapter {
  async getSecret(key: string): Promise<string> {
    return localStorage.getItem(key) ?? '';
  }

  async setSecret(key: string, value: string): Promise<void> {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  }

  async deleteSecret(key: string): Promise<void> {
    localStorage.removeItem(key);
  }

  supportsApiKeyUI(): boolean {
    return true;
  }

  describe(): { name: string } {
    return { name: 'localStorage（瀏覽器明文）' };
  }
}
