/**
 * v0.5.1：重寫，把 `if (isElectron())` 條件分支全部消除。
 *
 * 行為由「目前注入的 SettingsAdapter」決定：
 *   - 桌面版（預設 ElectronSafeStorageAdapter）→ window.edm.* 加密儲存
 *   - 瀏覽器版（預設 LocalStorageBrowserAdapter）→ localStorage 明文
 *   - 整合層（NoopSettingsAdapter）→ 完全不存（key 在 server 側）
 *
 * 對外 signature 完全不變，5 個 UI 元件無需改動。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getSettingsAdapter } from '@edm/lib/settings/registry';

export interface SettingsState {
  geminiApiKey: string;
  unsplashApiKey: string;
  pexelsApiKey: string;
  preferredCopyModel: 'gemini-2.5-flash' | 'gemini-2.5-pro';
  /**
   * v0.7.0：輸入解析完成後是否自動觸發 AI 文案 + 配圖生成。
   *
   * 預設 false（避免新使用者被偷偷扣 AI token）。
   * 開啟後，使用者於「輸入」分頁送入筆記 / 截圖 / HTML / 網址完成解析後，
   * 系統會繼續在背景跑 generateCopy + generateImage 並把結果套到對應區塊，
   * 達成「貼一次資料、整份 EDM 一鍵長成」的體驗。
   *
   * 必要先決條件：
   *   - geminiApiKey 已設定（文案 + AI 圖庫）
   *   - 有任一可用圖源（Imagen / Unsplash / Pexels），缺就跳過配圖階段
   */
  autoEnrichOnInput: boolean;
  loaded: boolean;

  setGeminiApiKey: (k: string) => Promise<void>;
  setUnsplashApiKey: (k: string) => Promise<void>;
  setPexelsApiKey: (k: string) => Promise<void>;
  setPreferredCopyModel: (m: 'gemini-2.5-flash' | 'gemini-2.5-pro') => void;
  setAutoEnrichOnInput: (v: boolean) => void;
  loadFromSecureStorage: () => Promise<void>;
}

const SECRET_KEYS = {
  gemini: 'gemini_api_key',
  unsplash: 'unsplash_api_key',
  pexels: 'pexels_api_key',
} as const;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      geminiApiKey: '',
      unsplashApiKey: '',
      pexelsApiKey: '',
      preferredCopyModel: 'gemini-2.5-flash',
      autoEnrichOnInput: false,
      loaded: false,

      setGeminiApiKey: async (k) => {
        await getSettingsAdapter().setSecret(SECRET_KEYS.gemini, k);
        set({ geminiApiKey: k });
      },
      setUnsplashApiKey: async (k) => {
        await getSettingsAdapter().setSecret(SECRET_KEYS.unsplash, k);
        set({ unsplashApiKey: k });
      },
      setPexelsApiKey: async (k) => {
        await getSettingsAdapter().setSecret(SECRET_KEYS.pexels, k);
        set({ pexelsApiKey: k });
      },
      setPreferredCopyModel: (m) => set({ preferredCopyModel: m }),
      setAutoEnrichOnInput: (v) => set({ autoEnrichOnInput: v }),

      loadFromSecureStorage: async () => {
        const adapter = getSettingsAdapter();
        // 整合層（NoopSettingsAdapter）也會走這個分支，三個 getSecret 都回 ''，
        // loaded 仍會被設為 true，UI 不會卡在「正在載入設定...」畫面。
        const [g, u, p] = await Promise.all([
          adapter.getSecret(SECRET_KEYS.gemini),
          adapter.getSecret(SECRET_KEYS.unsplash),
          adapter.getSecret(SECRET_KEYS.pexels),
        ]);
        set({ geminiApiKey: g, unsplashApiKey: u, pexelsApiKey: p, loaded: true });
      },
    }),
    {
      name: 'edm-settings',
      partialize: (s) => ({
        preferredCopyModel: s.preferredCopyModel,
        autoEnrichOnInput: s.autoEnrichOnInput,
      }),
    },
  ),
);
