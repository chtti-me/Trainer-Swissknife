/**
 * v0.5.0：原本是 Gemini SDK 的薄包裝（`getGeminiClient` + `hasGeminiKey`）。
 *
 * 重構後：
 *   - `getGeminiClient` 已被 `GeminiBrowserAdapter` 完整接管，不再對外暴露
 *   - `hasGeminiKey` 改名 `isAiAdapterReady`，語意改為「目前注入的 AiAdapter 是否可用」
 *     （瑞士刀整合走 server proxy 時，requiresApiKey=false，這裡會直接回 true，
 *      讓 UI 不再因為「沒 Gemini key」而擋住按鈕）
 *
 * 為了不動 5 個 UI 元件，`hasGeminiKey` 保留為別名指向 `isAiAdapterReady`。
 */

import { useSettingsStore } from '@edm/store/settingsStore';
import { getAiAdapter } from './registry';

/**
 * v0.5.0：判斷「目前 AI 系統是否可以用」。
 *
 * - 預設 GeminiBrowserAdapter（requiresApiKey=true）→ 看 useSettingsStore.geminiApiKey
 * - 瑞士刀 server proxy adapter（requiresApiKey=false）→ 直接回 true
 *
 * UI 應該用這個來決定要不要顯示「請先到設定填 Gemini API Key」警告。
 */
export function isAiAdapterReady(): boolean {
  const adapter = getAiAdapter();
  if (!adapter.describe().requiresApiKey) return true;
  return !!useSettingsStore.getState().geminiApiKey;
}

/**
 * @deprecated v0.5.0：請改用 `isAiAdapterReady`。保留為別名以避免破壞既有 UI 元件。
 */
export const hasGeminiKey = isAiAdapterReady;
