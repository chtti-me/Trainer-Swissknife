import { create } from 'zustand';

/**
 * 左右側面板的預設展開大小（百分比）。
 *
 * 注意：react-resizable-panels v4 的尺寸 props 數值有「單位陷阱」——
 * `defaultSize={22}` 會被當成 **22px**，要傳 `'22%'` 字串才是百分比。
 * 我們在程式內部仍以「百分比的純數字」傳遞（onResize 回傳 PanelSize.asPercentage 也是 0..100），
 * 但餵給 <Panel> props 時要記得用 `${n}%` 格式包好。
 */
export const DEFAULT_LEFT_SIZE = 22;
export const DEFAULT_RIGHT_SIZE = 22;
/** 拖曳時的最小寬度（百分比）；低於此值就視為「使用者想要關閉」直接 collapse */
export const MIN_PANEL_SIZE = 16;
export const MAX_PANEL_SIZE = 45;

interface UiState {
  /** 左側「輸入 / 資料 / 文案 / 圖片」面板是否展開 */
  leftPanelOpen: boolean;
  /** 右側「模板 / 配色 / 區塊 / 屬性」面板是否展開 */
  rightPanelOpen: boolean;
  /** 使用者拖曳後記憶的寬度（百分比），下次重新展開時還原到此寬度 */
  leftPanelSize: number;
  rightPanelSize: number;
  /** 全螢幕預覽模式：隱藏所有工具列與面板，只剩 EDM 與 ESC 提示 */
  fullscreenPreview: boolean;
  /** 進入預覽前的左/右面板狀態（用於離開預覽時還原） */
  _savedLeft: boolean | null;
  _savedRight: boolean | null;

  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  setLeftPanel: (open: boolean) => void;
  setRightPanel: (open: boolean) => void;

  /** 由 Panel onResize 回呼用：記住目前的拖曳寬度（下次展開時還原） */
  setLeftPanelSize: (size: number) => void;
  setRightPanelSize: (size: number) => void;

  /** 進入預覽佈局：保存目前左右面板狀態並關閉兩側 */
  enterPreviewLayout: () => void;
  /** 離開預覽佈局：還原進入前的左右面板狀態 */
  exitPreviewLayout: () => void;

  enterFullscreen: () => void;
  exitFullscreen: () => void;
  toggleFullscreen: () => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  leftPanelOpen: true,
  rightPanelOpen: true,
  leftPanelSize: DEFAULT_LEFT_SIZE,
  rightPanelSize: DEFAULT_RIGHT_SIZE,
  fullscreenPreview: false,
  _savedLeft: null,
  _savedRight: null,

  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setLeftPanel: (open) => set({ leftPanelOpen: open }),
  setRightPanel: (open) => set({ rightPanelOpen: open }),

  setLeftPanelSize: (size) => set({ leftPanelSize: size }),
  setRightPanelSize: (size) => set({ rightPanelSize: size }),

  enterPreviewLayout: () => {
    const s = get();
    // 已經在預覽佈局內就不重複保存
    if (s._savedLeft !== null || s._savedRight !== null) return;
    set({
      _savedLeft: s.leftPanelOpen,
      _savedRight: s.rightPanelOpen,
      leftPanelOpen: false,
      rightPanelOpen: false,
    });
  },
  exitPreviewLayout: () => {
    const s = get();
    if (s._savedLeft === null && s._savedRight === null) return;
    set({
      leftPanelOpen: s._savedLeft ?? true,
      rightPanelOpen: s._savedRight ?? true,
      _savedLeft: null,
      _savedRight: null,
    });
  },

  enterFullscreen: () => set({ fullscreenPreview: true }),
  exitFullscreen: () => set({ fullscreenPreview: false }),
  toggleFullscreen: () => set((s) => ({ fullscreenPreview: !s.fullscreenPreview })),
}));
