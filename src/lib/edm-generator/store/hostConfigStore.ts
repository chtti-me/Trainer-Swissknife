/**
 * v0.5.1：HostConfig store —— 全域可讀的整合配置。
 *
 * 為什麼用 Zustand 而不是 React Context：
 *   - 純 async caller（例如 generateCopy）也要讀 hostConfig.extraSystemInstructions，
 *     不能 hook 化
 *   - 與 modulesStore / edmStore / settingsStore 一致的全域 singleton 模式
 *
 * 由 `<EdmGenerator hostConfig={...} />` 在 mount 時呼叫 `setHostConfig` 寫入。
 * 桌面版預設 hostConfig 為空物件（一切走 EDM Generator 既有預設行為）。
 */

import { create } from 'zustand';
import type { HostConfig } from '@edm/lib/host/types';

interface HostConfigState {
  config: HostConfig;
  setHostConfig: (config: HostConfig) => void;
  /** 部分更新（例：執行期改 onExportPng）*/
  patchHostConfig: (patch: Partial<HostConfig>) => void;
  reset: () => void;
}

export const useHostConfigStore = create<HostConfigState>((set) => ({
  config: {},
  setHostConfig: (config) => set({ config }),
  patchHostConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
  reset: () => set({ config: {} }),
}));

/** 給非 React caller 用（例如 generateCopy 內部讀 extraSystemInstructions） */
export function getHostConfig(): HostConfig {
  return useHostConfigStore.getState().config;
}
