/**
 * Block × Token 相關性對照表（v0.4.3）
 *
 * 用途：BlockPaletteOverride popover 根據 block 類型，**只列出真的會影響該 block 視覺的 token**，
 * 並把欄位拆「core（常用，預設展開）」與「advanced（進階，預設折疊）」兩段，
 * 學 Microsoft Word 文字前景色 / 背景色 / 框線色那種「改了就會立即看到差異」的直觀體驗，
 * 避免使用者「我改了它沒反應」的困惑。
 *
 * ## level 設計原則
 *
 * - `core`：使用者一看 EDM 馬上看到的「**主視覺文字色**」與「**主結構底色**」。
 *           例如：hero 的班名色、cta 的按鈕底色。標籤直接用「視覺角色」描述（simpleLabel），
 *           不用 token 名稱（primary / accent...）。
 * - `advanced`：影響「**裝飾元素 / 邊框 / 強調 / 微小差異**」的色。
 *               例如：hero 的角落光暈、divider 的漸層起點。給進階使用者展開後可調。
 *
 * ## 維護注意
 *
 * 每次新增 / 修改 sub-renderer 對 token 的依賴，必須回頭同步本檔。
 * 來源：實際盤點 `src/lib/email/EmailTemplate.tsx` 內每個 sub-renderer 讀過哪些 token。
 */
import type { BlockType } from '@edm/types/blocks';
import type { ColorTokens } from '@edm/types/theme';

export type TokenKey = keyof ColorTokens;
export type TokenLevel = 'core' | 'advanced';

export interface TokenFieldDef {
  /** 對應到 ColorTokens 上的 key */
  key: TokenKey;
  /** popover 顯示的中文標籤（含 token 名稱，給 advanced 模式用） */
  label: string;
  /** core 模式專用的「視覺角色」標籤（不含 token 名稱），更貼近 Word 直觀體驗 */
  simpleLabel?: string;
  /** 該 block 上此 token 影響哪些視覺元素，給 popover hint */
  affects: string;
  /** 重要程度：core 預設展開、advanced 預設折疊 */
  level: TokenLevel;
}

/**
 * 每個 block 類型暴露給 popover 的 token 欄位順序（重要 token 排前面）。
 *
 * 規則：core 一律排前、advanced 排後。同 level 內依「使用者最常想改」的順序。
 */
export const BLOCK_TOKEN_RELEVANCE: Record<BlockType, TokenFieldDef[]> = {
  hero: [
    {
      key: 'textPrimary',
      label: '主標 / 班名色（textPrimary）',
      simpleLabel: '班名 / 主標色',
      affects: '所有模板的 hero 主標題文字（v0.4.3 起所有 variant 都吃此覆寫）',
      level: 'core',
    },
    {
      key: 'textSecondary',
      label: '副標 / 班代號色（textSecondary）',
      simpleLabel: '副標 / 班代號色',
      affects: '所有模板的 hero 副標題文字（含 academic 的班代號欄位）',
      level: 'core',
    },
    { key: 'primary', label: '主色（Primary）', affects: '漸層底色 / 角落光暈 / 裝飾 SVG', level: 'advanced' },
    { key: 'accent', label: '強調色（Accent）', affects: 'eyebrow 標籤 / accent rule / 角落色塊', level: 'advanced' },
    { key: 'secondary', label: '輔色（Secondary）', affects: 'Modern / Classic 的深底底色', level: 'advanced' },
    { key: 'bg', label: '頁面背景', affects: 'EDM 整體底色（影響全部 block）', level: 'advanced' },
  ],
  headline: [
    { key: 'textPrimary', label: '標題色', simpleLabel: '標題色', affects: '主標題文字', level: 'core' },
    { key: 'textSecondary', label: '副標色', affects: '副標文字', level: 'advanced' },
    { key: 'accent', label: '強調色', affects: '裝飾線 / Magazine 章節編號', level: 'advanced' },
  ],
  copy: [
    { key: 'textPrimary', label: '內文色', simpleLabel: '內文色', affects: '段落 / 列表文字', level: 'core' },
    { key: 'primary', label: '連結色', affects: '<a> 連結文字（透過全域 a CSS）', level: 'advanced' },
  ],
  courseTable: [
    { key: 'textPrimary', label: '課程名稱色', simpleLabel: '課程名稱色', affects: '課程名稱', level: 'core' },
    { key: 'border', label: '表格框線色', simpleLabel: '表格框線色', affects: '表格邊框與分隔線', level: 'core' },
    { key: 'primary', label: '主色', affects: 'Formal 表頭底色 / Banded 強調', level: 'advanced' },
    { key: 'accent', label: '強調色', affects: 'Section 標題 / 編號 / 合計數字', level: 'advanced' },
    { key: 'surface', label: '卡片底色', affects: 'Classic 表頭 / 合計列底色', level: 'advanced' },
    { key: 'textSecondary', label: '次要文字', affects: '時數 / 講師', level: 'advanced' },
  ],
  instructor: [
    { key: 'textPrimary', label: '講師姓名色', simpleLabel: '講師姓名色', affects: '講師姓名', level: 'core' },
    { key: 'textSecondary', label: '簡介色', affects: 'bio 簡介文字', level: 'advanced' },
    { key: 'accent', label: '職銜色', affects: '姓名上方的 ROLE 小標', level: 'advanced' },
  ],
  cta: [
    {
      key: 'primary',
      label: '按鈕底色（Primary）',
      simpleLabel: '按鈕底色',
      affects: 'primary 樣式背景 / outline 樣式邊框與文字',
      level: 'core',
    },
    {
      key: 'textPrimary',
      label: '按鈕文字色',
      simpleLabel: '按鈕文字色',
      affects: '覆寫自動對比色（建議跟底色高對比）',
      level: 'core',
    },
    {
      key: 'textSecondary',
      label: '副連結色',
      affects: '副連結（secondary）文字',
      level: 'advanced',
    },
  ],
  image: [
    {
      key: 'textSecondary',
      label: '說明文字色',
      simpleLabel: '說明文字色',
      affects: '圖片下方 caption',
      level: 'core',
    },
  ],
  divider: [
    { key: 'border', label: '線條色', simpleLabel: '線條色', affects: 'thin-line / dashed 樣式', level: 'core' },
    { key: 'accent', label: '強調色', affects: 'double-line / wave / dots / 序號樣式', level: 'advanced' },
    { key: 'primary', label: '漸層起點', affects: 'gradient-bar 樣式起始色', level: 'advanced' },
  ],
  // 空白行不依 palette token 控色，背景由 block.background 直接 inline 控制 → 留空 array
  spacer: [],
  classDate: [
    { key: 'textPrimary', label: '日期文字色', simpleLabel: '日期文字色', affects: '日期內容', level: 'core' },
    { key: 'accent', label: '日期標籤色', simpleLabel: '日期標籤色', affects: '「上課日期」標籤文字', level: 'core' },
  ],
  classTime: [
    { key: 'textPrimary', label: '時間文字色', simpleLabel: '時間文字色', affects: '時間內容', level: 'core' },
    { key: 'accent', label: '時間標籤色', simpleLabel: '時間標籤色', affects: '「上課時間」標籤文字', level: 'core' },
  ],
  footer: [
    { key: 'textSecondary', label: '頁尾文字色', simpleLabel: '頁尾文字色', affects: '頁尾主文', level: 'core' },
    { key: 'primary', label: '連結色', simpleLabel: '連結色', affects: '頁尾連結 / Formal 上邊線', level: 'core' },
    { key: 'accent', label: '強調色', affects: 'Accent 樣式漸層條', level: 'advanced' },
    { key: 'surface', label: '卡片底色', affects: 'Accent 樣式背景', level: 'advanced' },
    { key: 'border', label: '分隔線色', affects: '連結之間的分隔符 / 內部分隔', level: 'advanced' },
  ],
};

/**
 * 取得 block 類型可被 override 的 token 欄位定義。
 *
 * 規則：
 *   1. 永遠回傳 BLOCK_TOKEN_RELEVANCE 中該類型對應的欄位。
 *   2. 若 block 上已有覆寫但欄位不在當前定義內（通常是舊資料 / 跨版本），仍把該 key
 *      補一個「未列入」欄位（標 advanced），讓使用者能看到並重置，避免遺孤色卡在資料裡。
 */
export function getRelevantTokenFields(
  blockType: BlockType,
  existingOverrides?: Partial<ColorTokens>,
): TokenFieldDef[] {
  const base = BLOCK_TOKEN_RELEVANCE[blockType] ?? [];
  if (!existingOverrides) return base;

  const baseKeys = new Set(base.map((f) => f.key));
  const orphans: TokenFieldDef[] = [];
  (Object.keys(existingOverrides) as TokenKey[]).forEach((k) => {
    if (!baseKeys.has(k)) {
      orphans.push({
        key: k,
        label: `${k}（已不適用）`,
        affects: '此 token 對目前 block 類型沒有實際效果，建議重置',
        level: 'advanced',
      });
    }
  });

  return base.concat(orphans);
}

/**
 * 把欄位依 level 拆兩組（給 popover UI 用）。
 *
 * @returns `{ core, advanced }` —— core 排前、advanced 排後，每組內保留 BLOCK_TOKEN_RELEVANCE 原順序。
 */
export function partitionTokenFields(fields: TokenFieldDef[]): {
  core: TokenFieldDef[];
  advanced: TokenFieldDef[];
} {
  const core: TokenFieldDef[] = [];
  const advanced: TokenFieldDef[] = [];
  for (const f of fields) {
    if (f.level === 'core') core.push(f);
    else advanced.push(f);
  }
  return { core, advanced };
}
