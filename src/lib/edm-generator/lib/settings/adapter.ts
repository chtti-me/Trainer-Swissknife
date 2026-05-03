/**
 * v0.5.1：SettingsAdapter 介面 —— 把「API Key 怎麼存」從 store 內部抽象出來。
 *
 * 動機：
 *   - 桌面版用 Electron safeStorage（OS 加密）→ ElectronSafeStorageAdapter
 *   - 瀏覽器版用 localStorage → LocalStorageBrowserAdapter
 *   - 整合進「培訓師瑞士刀」（Trainer Swiss Knife）時，key 在 server 不該 client 拿到
 *     → NoopSettingsAdapter（getSecret 永遠回 ''；setSecret no-op；UI 自動隱藏 API Key 欄位）
 *
 * settingsStore 內 `if (isElectron()) ... else ...` 條件分支被全部消除，
 * 行為由「目前注入了哪個 adapter」決定。
 */

/**
 * 統一 secret 儲存介面。
 *
 * 所有方法都 async（即使 LocalStorage 是同步的），讓未來 Electron / IndexedDB /
 * server-fetch 都能共用同一個 caller code。
 */
export interface SettingsAdapter {
  /** 讀取一個 secret；找不到回空字串（不 throw） */
  getSecret(key: string): Promise<string>;

  /** 寫入一個 secret；空字串等同於刪除 */
  setSecret(key: string, value: string): Promise<void>;

  /** 刪除一個 secret（等同 setSecret(key, '')，但語意更明確） */
  deleteSecret(key: string): Promise<void>;

  /**
   * 是否要在 UI 顯示 API Key 設定欄位。
   *
   * - true：顯示「Gemini API Key（必填）」欄位、SettingsDialog 正常開啟
   * - false：整個 SettingsDialog 不掛載、TopToolbar 齒輪按鈕也隱藏
   *   （瑞士刀整合時 key 在 server，使用者不需要看到）
   */
  supportsApiKeyUI(): boolean;

  /** 自我描述（給 UI / log 用） */
  describe(): { name: string };
}

/**
 * In-memory / no-op 實作 —— 給整合層（Next.js + server proxy）用。
 *
 * - `getSecret` 永遠回 ''（caller 該透過注入的 AiAdapter 走 server proxy，
 *   不該真的去拿 key）
 * - `setSecret` no-op（即使 SettingsDialog 出現也不會真的存進任何地方）
 * - `supportsApiKeyUI` 預設 false（讓整個 API Key UI 自動隱藏）
 */
export class NoopSettingsAdapter implements SettingsAdapter {
  async getSecret(): Promise<string> {
    return '';
  }
  async setSecret(): Promise<void> {
    // no-op
  }
  async deleteSecret(): Promise<void> {
    // no-op
  }
  supportsApiKeyUI(): boolean {
    return false;
  }
  describe(): { name: string } {
    return { name: 'Noop（整合層 / server proxy 模式）' };
  }
}
