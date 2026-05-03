/**
 * v0.5.3：edm-react barrel —— React UI 主入口。
 *
 * 對宿主應用（瑞士刀 / 其他 React app）的承諾：
 *   - 預設 export = `<EdmGenerator />` 主元件
 *   - 涵蓋整合所需的 props type 與 host integration types
 *
 * 用途：
 *   - 在 Next.js client component / Vite app 中嵌入完整編輯器
 *   - 不直接 import LocalStorageBrowser / ElectronSafeStorage adapter（要用就走 ./electron）
 *
 * 注意：這個 barrel **會** import @react-email、html2canvas 等 client-only 套件，
 *      不應在 Server Component 中 import。Server-side 請改用 `./core`。
 */

// ──────────────── 主元件 ────────────────
export { EdmGenerator, default as default } from '@edm/EdmGenerator';
export type { EdmGeneratorProps } from '@edm/EdmGenerator';

// ──────────────── 型別轉接（給 host 注入時用）────────────────
export type { HostConfig } from '@edm/lib/host/types';
export type { AiAdapter } from '@edm/lib/ai/adapter';
export type { SettingsAdapter } from '@edm/lib/settings/adapter';
export { NoopSettingsAdapter } from '@edm/lib/settings/adapter';

// ──────────────── 給整合層用的 stores（讀 only）────────────────
export { useEdmStore } from '@edm/store/edmStore';
export { useUiStore } from '@edm/store/uiStore';
export { useHostConfigStore, getHostConfig } from '@edm/store/hostConfigStore';
