/**
 * v0.5.3：套件主 entry —— 對外只 re-export `EdmGenerator` + 最常用 types。
 *
 * 宿主應用最簡用法：
 *
 *   import { EdmGenerator } from '@trainer-academy/edm-generator';
 *
 *   <EdmGenerator hostConfig={{ hideSettingsPanel: true }} />
 *
 * 進階用法（直接拿 core 的純函式 / Electron-only adapter）請改用：
 *
 *   import { generateCopy } from '@trainer-academy/edm-generator/core';
 *   import { ElectronSafeStorageAdapter } from '@trainer-academy/edm-generator/electron';
 */

export { EdmGenerator, default } from '@edm/EdmGenerator';
export type { EdmGeneratorProps } from '@edm/EdmGenerator';
export type { HostConfig } from '@edm/lib/host/types';
export type { AiAdapter } from '@edm/lib/ai/adapter';
export type { SettingsAdapter } from '@edm/lib/settings/adapter';
export { NoopSettingsAdapter } from '@edm/lib/settings/adapter';
