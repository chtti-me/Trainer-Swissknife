/**
 * v0.5.2：EDM Generator 主入口元件 —— 對宿主應用（瑞士刀 / 其他 React app）的公開 API。
 *
 * 設計目標：
 *   - 桌面版：`<EdmGenerator />` 不傳任何 prop，行為與 v0.5.1 之前完全相同
 *   - 整合層：傳入 `hostConfig` / `aiAdapter` / `settingsAdapter` / `initialPlan`
 *     就能在 Next.js 頁面中嵌入完整的編輯器，且 API Key UI 自動隱藏、AI 走 server proxy
 *
 * 與 App.tsx 的關係：
 *   - 從 v0.5.2 起，App.tsx 變成「桌面版的薄殼」，只負責
 *     loadFromSecureStorage 與 keyboard shortcuts，UI 主體交給這個元件
 *   - 整合層應該直接 `import { EdmGenerator } from '...'` 用這個元件，不該動 App.tsx
 */

import * as React from 'react';
import { AppShell } from '@edm/components/layout/AppShell';
import { useSettingsStore } from '@edm/store/settingsStore';
import { useEdmStore } from '@edm/store/edmStore';
import { useUiStore } from '@edm/store/uiStore';
import { useModulesStore } from '@edm/store/modulesStore';
import { useHostConfigStore } from '@edm/store/hostConfigStore';
import { setAiAdapter } from '@edm/lib/ai/registry';
import { setSettingsAdapter } from '@edm/lib/settings/registry';
import { setDraftStorageAdapter } from '@edm/lib/draft/registry';
import { useRestoreDraft } from '@edm/hooks/useRestoreDraft';
import { useAutosave } from '@edm/hooks/useAutosave';
import type { AiAdapter } from '@edm/lib/ai/adapter';
import type { SettingsAdapter } from '@edm/lib/settings/adapter';
import type { DraftStorageAdapter } from '@edm/lib/draft/adapter';
import type { HostConfig } from '@edm/lib/host/types';
import type { ClassPlan } from '@edm/types/classPlan';

export interface EdmGeneratorProps {
  // ─── 注入：依賴抽象 ───────────────────────────────────────
  /** 自訂 AiAdapter；不傳則走 GeminiBrowserAdapter（要 user 自己配 Gemini Key） */
  aiAdapter?: AiAdapter;
  /** 自訂 SettingsAdapter；不傳則依環境（Electron / 瀏覽器）lazy 建立 */
  settingsAdapter?: SettingsAdapter;
  /**
   * v0.7.5.0：自訂 DraftStorageAdapter（autosave 後端）；不傳則依環境（Electron fs / 瀏覽器 IndexedDB）
   * lazy 建立。整合層想關掉 autosave（讓宿主自己管）→ 注入 NoopDraftStorageAdapter。
   */
  draftStorageAdapter?: DraftStorageAdapter;
  /** 整合配置（隱藏 UI、export 攔截 hook、extra prompt 等） */
  hostConfig?: HostConfig;

  // ─── 注入：初始資料（也可放在 hostConfig 裡，這裡是 quality-of-life 別名）─
  initialPlan?: ClassPlan;
  initialTemplateId?: string;
  initialPaletteId?: string;
}

/**
 * 把 props 套入全域 stores / registries。
 * Effect 先後順序很重要：先注入 adapter，再 loadFromSecureStorage 才會走對的 adapter。
 */
function useApplyHostIntegration(props: EdmGeneratorProps): void {
  const { aiAdapter, settingsAdapter, draftStorageAdapter, hostConfig, initialPlan, initialTemplateId, initialPaletteId } =
    props;

  // 1) AiAdapter / SettingsAdapter / DraftStorageAdapter 注入 + 卸載時還原。
  //    用 useLayoutEffect（而非 useState lazy init）確保：
  //    a) 在所有子元件 useEffect 之前就注入（含 loadFromSecureStorage）
  //    b) React Strict Mode 模擬卸載/重掛載時，兩次 mount 都能正確重設 registry
  //       （useState lazy init 只跑一次，cleanup 卻每次都跑，造成第二次 mount 後 registry 為 null）
  React.useLayoutEffect(() => {
    if (aiAdapter) setAiAdapter(aiAdapter);
    if (settingsAdapter) setSettingsAdapter(settingsAdapter);
    if (draftStorageAdapter) setDraftStorageAdapter(draftStorageAdapter);
    return () => {
      if (aiAdapter) setAiAdapter(null);
      if (settingsAdapter) setSettingsAdapter(null);
      if (draftStorageAdapter) setDraftStorageAdapter(null);
      useHostConfigStore.getState().reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) hostConfig 寫進 store
  React.useState(() => {
    const cfg: HostConfig = { ...(hostConfig ?? {}) };
    if (initialPlan && !cfg.initialPlan) cfg.initialPlan = initialPlan;
    if (initialTemplateId && !cfg.initialTemplateId) cfg.initialTemplateId = initialTemplateId;
    if (initialPaletteId && !cfg.initialPaletteId) cfg.initialPaletteId = initialPaletteId;
    useHostConfigStore.getState().setHostConfig(cfg);
    return null;
  });

  // 3) 後續若 props 變更（例如 hostConfig 動態切換），同步寫回 store
  React.useEffect(() => {
    const cfg: HostConfig = { ...(hostConfig ?? {}) };
    if (initialPlan && !cfg.initialPlan) cfg.initialPlan = initialPlan;
    if (initialTemplateId && !cfg.initialTemplateId) cfg.initialTemplateId = initialTemplateId;
    if (initialPaletteId && !cfg.initialPaletteId) cfg.initialPaletteId = initialPaletteId;
    useHostConfigStore.getState().setHostConfig(cfg);
  }, [hostConfig, initialPlan, initialTemplateId, initialPaletteId]);
}

/** 在 mount 時把 hostConfig.initialPlan / templateId / paletteId 寫進 edmStore */
function useApplyInitialState(): void {
  React.useEffect(() => {
    const cfg = useHostConfigStore.getState().config;
    if (cfg.initialPlan || cfg.initialTemplateId || cfg.initialPaletteId) {
      useEdmStore.getState().initialize({
        plan: cfg.initialPlan,
        templateId: cfg.initialTemplateId,
        paletteId: cfg.initialPaletteId,
      });
    }
    // 故意空依賴：只在第一次 mount 時注入一次，後續不覆蓋使用者的編輯
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** 訂閱 plan / templateId 變更，觸發 hostConfig 對應的 callback */
function useSubscribeChanges(): void {
  React.useEffect(() => {
    let lastPlan = useEdmStore.getState().plan;
    let lastTemplate = useEdmStore.getState().templateId;
    const unsub = useEdmStore.subscribe((s) => {
      const cfg = useHostConfigStore.getState().config;
      if (s.plan !== lastPlan) {
        lastPlan = s.plan;
        cfg.onPlanChange?.(s.plan);
      }
      if (s.templateId !== lastTemplate) {
        lastTemplate = s.templateId;
        cfg.onTemplateChange?.(s.templateId);
      }
    });
    return unsub;
  }, []);
}

export function EdmGenerator(props: EdmGeneratorProps): React.JSX.Element {
  useApplyHostIntegration(props);
  useApplyInitialState();
  useSubscribeChanges();

  // v0.7.5.0：autosave —— 啟動時試還原上次草稿；ready=true 後 useAutosave 才開始訂閱寫入
  // 兩者時序：useApplyInitialState 同步先寫宿主 initial（若有），useRestoreDraft async
  // 在沒有宿主 initial 時才會還原 draft（host 優先 vs draft fallback）。
  const { ready: draftReady } = useRestoreDraft();
  useAutosave({ enabled: draftReady });

  const loadFromSecureStorage = useSettingsStore((s) => s.loadFromSecureStorage);
  const loaded = useSettingsStore((s) => s.loaded);
  const initModules = useModulesStore((s) => s.init);
  const undo = useEdmStore((s) => s.undo);
  const redo = useEdmStore((s) => s.redo);
  const toggleLeft = useUiStore((s) => s.toggleLeftPanel);
  const toggleRight = useUiStore((s) => s.toggleRightPanel);
  const toggleFullscreen = useUiStore((s) => s.toggleFullscreen);
  const exitFullscreen = useUiStore((s) => s.exitFullscreen);
  const fullscreen = useUiStore((s) => s.fullscreenPreview);

  React.useEffect(() => {
    void loadFromSecureStorage();
    void initModules();
  }, [loadFromSecureStorage, initModules]);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreen) {
        e.preventDefault();
        exitFullscreen();
        return;
      }
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }

      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      if ((e.key === 'b' || e.key === 'B') && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        toggleLeft();
        return;
      }
      if ((e.key === 'b' || e.key === 'B') && e.altKey) {
        e.preventDefault();
        toggleRight();
        return;
      }

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, toggleLeft, toggleRight, toggleFullscreen, exitFullscreen, fullscreen]);

  if (!loaded) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background text-muted-foreground">
        正在載入設定...
      </div>
    );
  }

  return <AppShell />;
}

export default EdmGenerator;
