/**
 * 【課程規劃報告產生器 - UI store】
 *
 * 純 UI 狀態，不會被 autosave 寫入 IDB：
 *   - 左/右面板開關
 *   - 目前選中的 canvas block id
 *   - 上下文選單顯示位置與 payload
 *   - 全螢幕狀態
 *   - 模板/配色 picker 開關
 */
"use client";

import { create } from "zustand";

export type ContextMenuKind =
  | { kind: "text"; selectionText: string; blockId: string | null }
  | { kind: "table"; cellRow: number; cellCol: number; blockId: string | null }
  | null;

interface UiStore {
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  setLeftPanelOpen: (b: boolean) => void;
  setRightPanelOpen: (b: boolean) => void;

  selectedBlockId: string | null;
  setSelectedBlockId: (id: string | null) => void;

  contextMenu: {
    open: boolean;
    x: number;
    y: number;
    payload: ContextMenuKind;
  };
  openContextMenu: (x: number, y: number, payload: ContextMenuKind) => void;
  closeContextMenu: () => void;

  templateGalleryOpen: boolean;
  setTemplateGalleryOpen: (b: boolean) => void;

  uploadDialogOpen: boolean;
  setUploadDialogOpen: (b: boolean) => void;

  exportPanelOpen: boolean;
  setExportPanelOpen: (b: boolean) => void;

  /** AI 處理中（generic flag，避免重複觸發） */
  aiBusy: boolean;
  setAiBusy: (b: boolean) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  leftPanelOpen: true,
  rightPanelOpen: true,
  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setLeftPanelOpen: (b) => set({ leftPanelOpen: b }),
  setRightPanelOpen: (b) => set({ rightPanelOpen: b }),

  selectedBlockId: null,
  setSelectedBlockId: (id) => set({ selectedBlockId: id }),

  contextMenu: { open: false, x: 0, y: 0, payload: null },
  openContextMenu: (x, y, payload) =>
    set({ contextMenu: { open: true, x, y, payload } }),
  closeContextMenu: () =>
    set({ contextMenu: { open: false, x: 0, y: 0, payload: null } }),

  templateGalleryOpen: false,
  setTemplateGalleryOpen: (b) => set({ templateGalleryOpen: b }),

  uploadDialogOpen: false,
  setUploadDialogOpen: (b) => set({ uploadDialogOpen: b }),

  exportPanelOpen: false,
  setExportPanelOpen: (b) => set({ exportPanelOpen: b }),

  aiBusy: false,
  setAiBusy: (b) => set({ aiBusy: b }),
}));
