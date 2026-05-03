/**
 * v0.4.1：把 blockShortcuts 純邏輯接進 React + Zustand store。
 *
 * 在 AppShell（或單一 Canvas 父元件）呼叫一次即可；hook 內部會：
 *   1. 取出最新的 selectedBlockId / blocks / 編輯狀態
 *   2. 註冊 window keydown listener（卸載時清掉）
 *   3. 用 getShortcutAction(e, ctx) 算出該做什麼，然後 dispatch
 */

import * as React from 'react';
import { useEdmStore } from '@edm/store/edmStore';
import { getShortcutAction } from '@edm/lib/keyboard/blockShortcuts';

interface UseBlockShortcutsOptions {
  /** 是否開啟 cheat sheet（dialog） */
  isCheatSheetOpen: boolean;
  /** 開／關 cheat sheet（從 ?  Esc 鍵觸發） */
  setCheatSheetOpen: (open: boolean) => void;
}

export function useBlockShortcuts({
  isCheatSheetOpen,
  setCheatSheetOpen,
}: UseBlockShortcutsOptions): void {
  // 用 ref 保存最新值避免 effect 反覆 re-bind listener；store 也是 stable，不需要重新訂閱
  const stateRef = React.useRef({ isCheatSheetOpen });
  stateRef.current.isCheatSheetOpen = isCheatSheetOpen;

  React.useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isInputTarget =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable === true;

      const s = useEdmStore.getState();
      const idx = s.selectedBlockId
        ? s.blocks.findIndex((b) => b.id === s.selectedBlockId)
        : -1;

      const action = getShortcutAction(e, {
        selectedBlockId: s.selectedBlockId,
        selectedIndex: idx,
        totalBlocks: s.blocks.length,
        isDialogOpen: s.editingBlockId !== null,
        isCheatSheetOpen: stateRef.current.isCheatSheetOpen,
        isInputTarget,
      });

      if (!action) return;

      e.preventDefault();
      e.stopPropagation();

      switch (action.type) {
        case 'duplicate':
          if (s.selectedBlockId) s.duplicateBlock(s.selectedBlockId);
          break;
        case 'remove':
          if (s.selectedBlockId) s.removeBlock(s.selectedBlockId);
          break;
        case 'move-up':
          if (idx > 0) s.moveBlock(idx, idx - 1);
          break;
        case 'move-down':
          if (idx >= 0 && idx < s.blocks.length - 1) s.moveBlock(idx, idx + 1);
          break;
        case 'deselect':
          s.selectBlock(null);
          break;
        case 'open-cheatsheet':
          setCheatSheetOpen(true);
          break;
        case 'close-cheatsheet':
          setCheatSheetOpen(false);
          break;
      }
    };

    window.addEventListener('keydown', handler, { capture: false });
    return () => window.removeEventListener('keydown', handler);
  }, [setCheatSheetOpen]);
}
