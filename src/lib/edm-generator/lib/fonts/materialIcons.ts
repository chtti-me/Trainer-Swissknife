/**
 * Material Symbols icon catalog（v0.7.2）
 *
 * Material Symbols 字型透過 ligature 機制：當字串「home」用 `font-family: 'Material Symbols Outlined'`
 * 渲染時，會自動變成 home icon。所以 RichTextEditor 的「插入 icon」功能本質上就是：
 *
 *   1. 使用者選一個 icon（從這份目錄）
 *   2. 我們 insertHTML `<span style="font-family:'Material Symbols Outlined'">home</span>`
 *   3. 字型 ligature 自動把 "home" → 🏠 icon
 *
 * 為什麼不全 1500+ 個 icon？因為 v0.7.2 的目標是「能用」而不是「全」。我們先精選 ~40 個
 * EDM 與培訓場景常見的 icon。未來可擴充。
 *
 * 字型 stack：cssFamily 來自 fonts/registry 的 material-symbols-outlined。
 */

export type MaterialIconCategory = 'common' | 'communication' | 'time' | 'place' | 'edu' | 'arrow' | 'status';

export interface MaterialIconDef {
  /** Material Symbols 的 ligature 字串（也是顯示在 HTML 中的文字） */
  name: string;
  /** UI 顯示用的中文標籤 */
  label: string;
  category: MaterialIconCategory;
}

export const MATERIAL_ICONS: MaterialIconDef[] = [
  // 常用
  { name: 'home', label: '首頁', category: 'common' },
  { name: 'star', label: '星星', category: 'common' },
  { name: 'favorite', label: '愛心（實心）', category: 'common' },
  { name: 'bookmark', label: '書籤', category: 'common' },
  { name: 'verified', label: '已認證', category: 'common' },
  { name: 'check_circle', label: '勾選圈', category: 'common' },
  { name: 'lightbulb', label: '燈泡', category: 'common' },
  { name: 'rocket_launch', label: '火箭', category: 'common' },

  // 通訊
  { name: 'mail', label: '信件', category: 'communication' },
  { name: 'phone', label: '電話', category: 'communication' },
  { name: 'chat', label: '對話', category: 'communication' },
  { name: 'forum', label: '論壇', category: 'communication' },
  { name: 'campaign', label: '宣傳擴音', category: 'communication' },
  { name: 'share', label: '分享', category: 'communication' },

  // 時間
  { name: 'schedule', label: '時鐘', category: 'time' },
  { name: 'event', label: '日曆', category: 'time' },
  { name: 'today', label: '今日', category: 'time' },
  { name: 'history', label: '歷史', category: 'time' },
  { name: 'timer', label: '計時器', category: 'time' },

  // 地點
  { name: 'location_on', label: '位置 pin', category: 'place' },
  { name: 'place', label: '地點', category: 'place' },
  { name: 'map', label: '地圖', category: 'place' },
  { name: 'business', label: '辦公大樓', category: 'place' },

  // 教育
  { name: 'school', label: '學校', category: 'edu' },
  { name: 'menu_book', label: '書本', category: 'edu' },
  { name: 'cast_for_education', label: '線上教育', category: 'edu' },
  { name: 'workspace_premium', label: '證書徽章', category: 'edu' },
  { name: 'psychology', label: '思考', category: 'edu' },
  { name: 'auto_stories', label: '翻頁書', category: 'edu' },

  // 箭頭
  { name: 'arrow_forward', label: '右箭頭', category: 'arrow' },
  { name: 'arrow_back', label: '左箭頭', category: 'arrow' },
  { name: 'arrow_upward', label: '上箭頭', category: 'arrow' },
  { name: 'arrow_downward', label: '下箭頭', category: 'arrow' },
  { name: 'trending_up', label: '上升趨勢', category: 'arrow' },
  { name: 'chevron_right', label: '展開（右）', category: 'arrow' },

  // 狀態
  { name: 'new_releases', label: 'NEW 標', category: 'status' },
  { name: 'priority_high', label: '優先標', category: 'status' },
  { name: 'flag', label: '旗幟', category: 'status' },
  { name: 'pending_actions', label: '待辦', category: 'status' },
  { name: 'task_alt', label: '已完成', category: 'status' },
  { name: 'workspaces', label: '群組', category: 'status' },
];

export const MATERIAL_ICON_CATEGORY_LABEL: Record<MaterialIconCategory, string> = {
  common: '常用',
  communication: '通訊',
  time: '時間',
  place: '地點',
  edu: '教育 / 培訓',
  arrow: '箭頭',
  status: '狀態',
};

export const MATERIAL_ICON_CATEGORY_ORDER: MaterialIconCategory[] = [
  'common',
  'edu',
  'time',
  'place',
  'communication',
  'arrow',
  'status',
];

/** 取得指定 category 的 icons（按 registry 中的順序） */
export function getMaterialIconsByCategory(category: MaterialIconCategory): MaterialIconDef[] {
  return MATERIAL_ICONS.filter((i) => i.category === category);
}

/**
 * 給定一個 icon name，產出一段可插入到 contentEditable 的 HTML。
 * 結構：`<span style="font-family:'Material Symbols Outlined';font-size:20px">name</span>`
 *
 * 字級用 inline style 鎖定 20px，避免 ligature 在小字級下視覺塞滿、看起來不像 icon。
 */
export function buildMaterialIconHtml(name: string): string {
  return `<span style="font-family:&quot;Material Symbols Outlined&quot;;font-size:20px">${name}</span>`;
}
