/**
 * v0.5.3：edm-electron-integration barrel —— 桌面殼專用 adapters。
 *
 * 一般情況下，宿主應用（Next.js / 純瀏覽器）**不需要** import 這個 barrel：
 *   - SettingsAdapter 預設已會偵測 Electron 環境並 lazy 建立 ElectronSafeStorageAdapter
 *   - 直接 import 它會在非 Electron 環境呼叫 window.edm.* 時 throw
 *
 * 適用情境：
 *   - 想在 Electron renderer 自己 new 一個 ElectronSafeStorageAdapter 並注入（少見）
 *   - 想在測試中以 mock window.edm 的方式驗證 adapter 行為
 */

export { ElectronSafeStorageAdapter } from '@edm/lib/settings/adapters/electronSafeStorage';
export { LocalStorageBrowserAdapter } from '@edm/lib/settings/adapters/localStorageBrowser';
export { isElectron } from '@edm/lib/utils';
