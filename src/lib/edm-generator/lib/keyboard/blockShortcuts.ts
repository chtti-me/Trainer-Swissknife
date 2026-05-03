/**
 * v0.4.1：block 操作鍵盤快捷鍵 —— 純邏輯層。
 *
 * 把「KeyboardEvent + 當前選中狀態 → 要做的動作」抽成純函式，方便：
 *   - 在 verify 中跑 Node-side unit test（不需要 jsdom）
 *   - 未來增刪快捷鍵時集中改動
 *
 * 副作用（呼叫 store / preventDefault）由 `useBlockShortcuts` 處理。
 */

/** 鍵盤快捷鍵能觸發的動作種類 */
export type ShortcutAction =
  | { type: 'duplicate' }
  | { type: 'remove' }
  | { type: 'move-up' }
  | { type: 'move-down' }
  | { type: 'deselect' }
  | { type: 'open-cheatsheet' }
  | { type: 'close-cheatsheet' };

/** 計算動作所需的 context */
export interface ShortcutContext {
  /** 目前選中的 block id（沒選為 null） */
  selectedBlockId: string | null;
  /** 目前選中 block 在 blocks 陣列中的 index（沒選為 -1） */
  selectedIndex: number;
  /** blocks 總數，用來判斷可不可以下移 */
  totalBlocks: number;
  /** 屬性面板的 dialog 是否開著（開著時不應該攔鍵盤） */
  isDialogOpen: boolean;
  /** cheat sheet 是否開著（開著時 ? 應該關閉而非開啟） */
  isCheatSheetOpen: boolean;
  /** 事件目標是不是輸入欄位 / contentEditable（這些情況不攔） */
  isInputTarget: boolean;
}

/**
 * 把 KeyboardEvent 對應到要做的 action；不該做事時回傳 null。
 *
 * 攔截規則（一律不攔）：
 *   - 在 `<input>` / `<textarea>` / contentEditable 元素內按鍵
 *   - 屬性編輯 dialog 開著
 *
 * 攔截規則（有條件攔）：
 *   - 沒選任何 block 時，僅 `Esc`（關閉 cheat sheet 用）與 `?`（開啟 cheat sheet）有作用
 *
 * 已支援的鍵：
 *   - `Ctrl/Cmd + D` 複製（避開瀏覽器加書籤行為）
 *   - `Delete` / `Backspace` 刪除
 *   - `Ctrl/Cmd + ArrowUp/ArrowDown` 移位
 *   - `Esc` 取消選中 / 關 cheat sheet
 *   - `?`（Shift+/）開 cheat sheet
 */
export function getShortcutAction(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
  ctx: ShortcutContext,
): ShortcutAction | null {
  // 在輸入欄 / dialog 內 → 一律放行給原生行為
  if (ctx.isInputTarget) return null;
  if (ctx.isDialogOpen) return null;

  const ctrlOrCmd = e.ctrlKey || e.metaKey;

  // ? 鍵（Shift+/）—— 不需 ctrl
  if (e.key === '?' && !ctrlOrCmd && !e.altKey) {
    return ctx.isCheatSheetOpen ? { type: 'close-cheatsheet' } : { type: 'open-cheatsheet' };
  }

  // Esc —— 先關 cheat sheet，沒開的話再取消選中
  if (e.key === 'Escape') {
    if (ctx.isCheatSheetOpen) return { type: 'close-cheatsheet' };
    if (ctx.selectedBlockId) return { type: 'deselect' };
    return null;
  }

  // 以下動作都需要先選中 block
  if (!ctx.selectedBlockId) return null;

  // Ctrl/Cmd + D 複製
  if ((e.key === 'd' || e.key === 'D') && ctrlOrCmd && !e.altKey) {
    return { type: 'duplicate' };
  }

  // Delete / Backspace 刪除（注意：Backspace 在 macOS 是慣用 Delete 的鍵）
  if (e.key === 'Delete' || e.key === 'Backspace') {
    return { type: 'remove' };
  }

  // Ctrl/Cmd + ArrowUp / ArrowDown 移位
  if (e.key === 'ArrowUp' && ctrlOrCmd && !e.altKey) {
    if (ctx.selectedIndex > 0) return { type: 'move-up' };
    return null;
  }
  if (e.key === 'ArrowDown' && ctrlOrCmd && !e.altKey) {
    if (ctx.selectedIndex >= 0 && ctx.selectedIndex < ctx.totalBlocks - 1) return { type: 'move-down' };
    return null;
  }

  return null;
}

/**
 * 快捷鍵分組（v0.4.4）。
 *
 * - `block`：操作目前選中區塊（複製 / 刪除 / 移位）
 * - `dialog`：開關各種 dialog / cheat sheet
 * - `edit`：進入 inline 編輯
 *
 * 同一個 doc 一次只屬於一組。
 */
export type ShortcutGroup = 'block' | 'dialog' | 'edit';

export interface ShortcutDoc {
  keys: string[];
  description: string;
  group: ShortcutGroup;
}

export const SHORTCUT_DOCS: ShortcutDoc[] = [
  { keys: ['Ctrl', 'D'], description: '複製選中區塊（Cmd+D on macOS）', group: 'block' },
  { keys: ['Delete'], description: '刪除選中區塊', group: 'block' },
  { keys: ['Backspace'], description: '刪除選中區塊（同 Delete）', group: 'block' },
  { keys: ['Ctrl', '↑'], description: '把選中區塊往上移一格', group: 'block' },
  { keys: ['Ctrl', '↓'], description: '把選中區塊往下移一格', group: 'block' },
  { keys: ['Esc'], description: '取消選中（cheat sheet 開啟時改為關閉）', group: 'dialog' },
  { keys: ['?'], description: '開啟／關閉本快捷鍵清單', group: 'dialog' },
  {
    keys: ['雙擊文字'],
    description: '進入 inline 編輯（hero 標題、headline、copy 段落、CTA 文字）',
    group: 'edit',
  },
];

/**
 * 把 SHORTCUT_DOCS 按 group 分組並保留原順序。
 *
 * 給 cheat sheet UI 用：core 操作排前、dialog 與 edit 排後。
 */
export function groupShortcutDocs(): Record<ShortcutGroup, ShortcutDoc[]> {
  const out: Record<ShortcutGroup, ShortcutDoc[]> = {
    block: [],
    dialog: [],
    edit: [],
  };
  for (const doc of SHORTCUT_DOCS) {
    out[doc.group].push(doc);
  }
  return out;
}

/** 各分組的中文標題（給 UI 用） */
export const SHORTCUT_GROUP_LABELS: Record<ShortcutGroup, string> = {
  block: '區塊操作',
  dialog: '對話框',
  edit: '編輯',
};
