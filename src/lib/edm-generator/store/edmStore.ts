import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Block, BlockOrigin, BlockType } from '@edm/types/blocks';
import type { ClassPlan } from '@edm/types/classPlan';
import type { ColorTokens, Typography } from '@edm/types/theme';
import type { GeneratedCopy } from '@edm/types/copy';
import type { ImageRatio, ImageStyle } from '@edm/lib/ai/generateImage';
import { defaultTypography } from '@edm/types/theme';
import { emptyClassPlan } from '@edm/types/classPlan';
import { PALETTE_PRESETS, getPaletteById } from '@edm/lib/palettes/presets';
import { TEMPLATES, buildBlocksForTemplate } from '@edm/lib/templates';
import { getTemplateStyle } from '@edm/lib/templates/styles';
import { applyCopyVersionToBlocks, isCoreFieldPatch } from '@edm/lib/templates/helpers';

/**
 * Hero 圖的來源描述（用來決定切模板後要不要建議「依新模板重生」）。
 *
 * - `ai`：透過 generateImage 生圖，會記錄 prompt / ratio / style / 當時 templateId，
 *   讓切模板後可一鍵沿用相同 prompt 重跑
 * - `stock`：來自 Unsplash / Pexels（重生只需重搜尋，不沿用 prompt）
 * - `geo`：本地產生的 SVG 幾何圖樣
 * - `upload`：使用者自行上傳檔案
 * - `undefined`：沒有 hero 圖
 */
export type HeroSource = 'ai' | 'stock' | 'geo' | 'upload';

export interface HeroMeta {
  source?: HeroSource;
  /** 該 AI 生圖時用的 templateId；切模板後若 != 當前 templateId 即觸發提示 */
  aiTemplateId?: string;
  /** 沿用重生時要的 prompt 內文 */
  aiPrompt?: string;
  /** 沿用重生時要的 style（photo / tech / minimal …） */
  aiStyle?: ImageStyle;
  /** 沿用重生時要的 ratio */
  aiRatio?: ImageRatio;
  aiWithText?: boolean;
}

/** 把模板偏好的 typography（部分欄位）合併進使用者目前的 typography */
function applyTemplateTypography(
  current: Typography,
  templateId: string,
): Typography {
  const t = getTemplateStyle(templateId).typography;
  return {
    ...current,
    ...t,
    weight: { ...(current.weight ?? defaultTypography.weight!), ...(t.weight ?? {}) },
    letterSpacing: {
      ...(current.letterSpacing ?? defaultTypography.letterSpacing!),
      ...(t.letterSpacing ?? {}),
    },
    lineHeight: {
      ...(current.lineHeight ?? defaultTypography.lineHeight!),
      ...(t.lineHeight ?? {}),
    },
  };
}

export interface EdmSnapshot {
  plan: ClassPlan;
  blocks: Block[];
  templateId: string;
  paletteId: string;
  tokens: ColorTokens;
  typography: Typography;
  copy: GeneratedCopy | null;
  heroImage?: string;
  /** Hero 圖的來源 metadata，給 HeroAdaptBanner 判斷是否提示重生 */
  heroMeta: HeroMeta;
}

interface EdmState extends EdmSnapshot {
  selectedBlockId: string | null;
  /** 目前正在「編輯屬性 Popup」中編輯的區塊 id；null 表示無 popup 開啟 */
  editingBlockId: string | null;
  past: EdmSnapshot[];
  future: EdmSnapshot[];

  setPlan: (p: ClassPlan) => void;
  patchPlan: (patch: Partial<ClassPlan>) => void;

  setTemplate: (templateId: string) => void;
  setPalette: (paletteId: string) => void;
  patchTokens: (patch: Partial<ColorTokens>) => void;
  setTypography: (t: Typography) => void;

  setCopy: (c: GeneratedCopy | null) => void;
  /**
   * 設定 hero 圖；可選傳入 metadata 描述圖的來源。
   * - 不傳 meta（或 meta.source 為 undefined）→ 視為「清空 / 未知來源」
   * - 傳 source: 'ai' 並附 aiTemplateId / aiPrompt → 切模板後可一鍵重生
   */
  setHeroImage: (src: string | undefined, meta?: HeroMeta) => void;
  /** 由切模板後的 banner 點「重生」呼叫；只更新 heroMeta.aiTemplateId 為當前 templateId */
  acknowledgeHeroAdapted: () => void;

  setBlocks: (blocks: Block[]) => void;
  addBlock: (block: Block, index?: number) => void;
  updateBlock: (id: string, patch: Partial<Block>) => void;
  removeBlock: (id: string) => void;
  moveBlock: (from: number, to: number) => void;
  duplicateBlock: (id: string) => void;
  selectBlock: (id: string | null) => void;
  openBlockEditor: (id: string | null) => void;

  rebuildFromTemplate: () => void;

  /**
   * v0.5.2：宿主應用（瑞士刀 / 其他 React app）一次塞入初始狀態。
   *
   * - 與 setPlan / setTemplate / setPalette 一併呼叫的差別：
   *     1) 原子性套用（避免 setTemplate 重新 build blocks 後，setPlan 又再 build 一次）
   *     2) **不寫 history**（避免使用者第一次 undo 就回到一個空白 ClassPlan）
   * - 任何欄位省略則保留目前值；plan 與 templateId 同傳時，blocks 會依據新 plan 重 build
   */
  initialize: (opts: {
    plan?: ClassPlan;
    templateId?: string;
    paletteId?: string;
  }) => void;

  /**
   * v0.7.5.0：autosave 還原 —— 從 IndexedDB / Electron fs 讀回 EdmSnapshot 後一次塞入。
   *
   * 與 `initialize` 的差異：
   *   1) `initialize` 套用宿主 `initialPlan` + 重 build blocks；本 action **直接還原 blocks**
   *      （使用者上次離開時 blocks 已包含他的所有手動編輯，不能再從 plan rebuild）
   *   2) 同樣不寫 history（避免第一次 undo 回到啟動空狀態）
   *   3) 同樣重置 selectedBlockId / editingBlockId（這些是 UI 暫態，不該還原）
   *
   * 注意：caller 應在 mount 期確保 hostConfig.initialPlan 不存在時才呼叫本 action
   *       （宿主的明確需求 > 使用者上次的草稿）。
   */
  restoreFromDraft: (snapshot: EdmSnapshot) => void;

  /**
   * v0.7.5.2：使用者觸發的「重置 EDM」── 把所有狀態歸零回到 store 剛初始化時的樣子。
   *
   * 重置內容：
   *   - `plan` → emptyClassPlan()
   *   - `blocks` → buildBlocksForTemplate('classic', { plan: emptyPlan, copy: null })（預設模板的空白 blocks）
   *   - `templateId` → 'classic'
   *   - `paletteId` / `tokens` → 第一個預設配色
   *   - `typography` → defaultTypography（套 'classic' 模板的 preset）
   *   - `copy` / `heroImage` / `heroMeta` → 全清
   *   - `past` / `future` → 全清（重置就是清掉歷史，不該能 undo 回去）
   *   - `selectedBlockId` / `editingBlockId` → null（UI 暫態）
   *
   * 注意：本 action **不會清掉 IndexedDB / Electron 檔案系統的 autosave 草稿** ──
   *       那是 caller 的責任（呼叫 `getDraftStorageAdapter().clear()`），原因：
   *       store 不該知道 storage adapter 的存在（避免循環依賴）。
   *       Caller 應該用「先 clear adapter → 再 resetToInitial」順序，
   *       否則 useAutosave 會在 800ms 後把空狀態又寫回（雖然結果一樣，但有 race window）。
   */
  resetToInitial: () => void;
  /**
   * v0.4.0 新增：partial update 套用新版 GeneratedCopy。
   *
   * 與舊的 `setCopy(c) + rebuildFromTemplate()` 兩步驟組合相比：
   * - **保留使用者的手動編輯**：origin.edited === true 的 block 不被覆蓋
   * - **保留使用者新增的 block**：origin.source === 'user' 的 block 不被覆蓋
   * - **保留 block 順序與額外的 plan-only 段落**（例如 audience copy / instructor）
   *
   * 回傳實際被覆寫與被保留的 block 數，UI 可拿來顯示 toast。
   * 若 newCopy 為 null，等價於 `setCopy(null) + rebuild()`（整個重建，作為 fallback）。
   */
  applyCopyVersion: (newCopy: GeneratedCopy) => { preservedCount: number; updatedCount: number };

  /**
   * v0.4.2：把一段 blocks（通常來自 SavedModule）插入到 EDM 中。
   *
   * - `at === 'after-selected'`（預設）：插在目前選中 block 之後；沒選就 append 到末尾
   * - `at === 'end'`：append 到末尾
   * - `at === 'start'`：插到最前面
   * - `at: number`：插到指定 index
   *
   * Caller 應該先呼叫 `useModulesStore.instantiateModuleBlocks(id)` 取得「id 已換新」的 blocks，
   * 再傳進來；本 action 不重新換 id（避免重複工作）。
   */
  insertBlocks: (
    blocks: Block[],
    at?: 'after-selected' | 'end' | 'start' | number,
  ) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const initialPlan = emptyClassPlan();
const initialTemplate = 'classic';
const initialPalette = PALETTE_PRESETS[0];
const initialTypography = applyTemplateTypography(defaultTypography, initialTemplate);

const snapshot = (s: EdmState): EdmSnapshot => ({
  plan: s.plan,
  blocks: s.blocks,
  templateId: s.templateId,
  paletteId: s.paletteId,
  tokens: s.tokens,
  typography: s.typography,
  copy: s.copy,
  heroImage: s.heroImage,
  heroMeta: s.heroMeta,
});

const pushHistory = (s: EdmState): Pick<EdmState, 'past' | 'future'> => ({
  past: [...s.past.slice(-49), snapshot(s)],
  future: [],
});

export const useEdmStore = create<EdmState>((set, get) => ({
  plan: initialPlan,
  blocks: buildBlocksForTemplate(initialTemplate, { plan: initialPlan, copy: null }),
  templateId: initialTemplate,
  paletteId: initialPalette.id,
  tokens: initialPalette.tokens,
  typography: initialTypography,
  copy: null,
  heroImage: undefined,
  heroMeta: {},
  selectedBlockId: null,
  editingBlockId: null,
  past: [],
  future: [],

  setPlan: (p) =>
    set((s) => ({
      ...pushHistory(s),
      plan: p,
    })),
  patchPlan: (patch) =>
    set((s) => ({
      ...pushHistory(s),
      plan: { ...s.plan, ...patch, mentor: { ...s.plan.mentor, ...(patch.mentor ?? {}) } },
    })),

  setTemplate: (templateId) =>
    set((s) => {
      const blocks = buildBlocksForTemplate(templateId, { plan: s.plan, copy: s.copy, heroImage: s.heroImage });
      // 切換模板時同步：
      // 1) typography 採用該模板的 preset（保留使用者自訂的 baseSize 等）
      // 2) palette 自動換到該模板的推薦配色，但若使用者已自訂過 palette 則不覆寫
      const style = getTemplateStyle(templateId);
      const typography = applyTemplateTypography(s.typography, templateId);

      // 判斷使用者是否動過 palette：若目前的 paletteId 仍是某個預設、且該預設與目前 templateId 推薦的不同，
      // 才主動切換；如果使用者改過 tokens（patchTokens）我們無法可靠判斷，這裡採保守策略：
      //   - 只在 paletteId 是已知的某個 preset 時才自動換
      const isKnownPreset = PALETTE_PRESETS.some((p) => p.id === s.paletteId);
      const shouldSwitchPalette =
        isKnownPreset && s.paletteId !== style.recommendedPaletteId;
      const paletteId = shouldSwitchPalette ? style.recommendedPaletteId : s.paletteId;
      const tokens = shouldSwitchPalette ? getPaletteById(paletteId).tokens : s.tokens;

      return { ...pushHistory(s), templateId, blocks, typography, paletteId, tokens };
    }),

  setPalette: (paletteId) =>
    set((s) => ({
      ...pushHistory(s),
      paletteId,
      tokens: getPaletteById(paletteId).tokens,
    })),

  patchTokens: (patch) => set((s) => ({ ...pushHistory(s), tokens: { ...s.tokens, ...patch } })),

  setTypography: (t) => set((s) => ({ ...pushHistory(s), typography: t })),

  setCopy: (c) => set((s) => ({ ...pushHistory(s), copy: c })),

  setHeroImage: (src, meta) =>
    set((s) => {
      const blocks = s.blocks.map((b) => (b.type === 'hero' ? { ...b, image: src } : b));
      // 沒傳 meta 或 src 為 undefined 時清空 heroMeta，避免「移除圖後 UI 仍以為是 AI 圖」
      const nextMeta: HeroMeta = !src ? {} : meta ?? {};
      return { ...pushHistory(s), heroImage: src, heroMeta: nextMeta, blocks };
    }),

  acknowledgeHeroAdapted: () =>
    set((s) => ({
      ...pushHistory(s),
      heroMeta: { ...s.heroMeta, aiTemplateId: s.templateId },
    })),

  setBlocks: (blocks) => set((s) => ({ ...pushHistory(s), blocks })),

  addBlock: (block, index) =>
    set((s) => {
      // v0.4.0：使用者透過 BlocksPanel / 拖曳新增的 block，預設標為 'user' source；
      // applyCopyVersion 切版本時不會去動它。caller 若想塞「自訂 blueprint block」可自行傳 origin。
      const tagged: Block = block.origin
        ? block
        : ({ ...block, origin: { source: 'user' } as BlockOrigin } as Block);
      const next = [...s.blocks];
      if (typeof index === 'number') next.splice(index, 0, tagged);
      else next.push(tagged);
      return { ...pushHistory(s), blocks: next };
    }),

  updateBlock: (id, patch) =>
    set((s) => ({
      ...pushHistory(s),
      blocks: s.blocks.map((b) => {
        if (b.id !== id) return b;
        const next = { ...b, ...patch } as Block;
        // 若 caller 自己帶了 origin（例如 applyCopyVersion 內部用），尊重之；
        // 否則自動偵測：若 patch 動到 regenerator 對應的核心欄位 → 標 edited
        if (!('origin' in patch) && isCoreFieldPatch(b, patch)) {
          next.origin = { ...(b.origin ?? { source: 'blueprint' }), edited: true };
        }
        return next;
      }),
    })),

  removeBlock: (id) =>
    set((s) => ({
      ...pushHistory(s),
      blocks: s.blocks.filter((b) => b.id !== id),
      selectedBlockId: s.selectedBlockId === id ? null : s.selectedBlockId,
    })),

  moveBlock: (from, to) =>
    set((s) => {
      const arr = [...s.blocks];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return { ...pushHistory(s), blocks: arr };
    }),

  duplicateBlock: (id) =>
    set((s) => {
      const idx = s.blocks.findIndex((b) => b.id === id);
      if (idx < 0) return s;
      // 複製出來的 block 視為使用者新增（source: 'user'），且必為 edited（避免 partial update 覆蓋）
      const original = s.blocks[idx];
      const clone = {
        ...original,
        id: nanoid(8),
        origin: { source: 'user', edited: true } as BlockOrigin,
      } as Block;
      const arr = [...s.blocks];
      arr.splice(idx + 1, 0, clone);
      return { ...pushHistory(s), blocks: arr };
    }),

  selectBlock: (id) => set({ selectedBlockId: id }),
  openBlockEditor: (id) => set({ editingBlockId: id, selectedBlockId: id ?? get().selectedBlockId }),

  rebuildFromTemplate: () =>
    set((s) => ({
      ...pushHistory(s),
      blocks: buildBlocksForTemplate(s.templateId, { plan: s.plan, copy: s.copy, heroImage: s.heroImage }),
    })),

  initialize: (opts) =>
    set((s) => {
      const plan = opts.plan ?? s.plan;
      const templateId = opts.templateId ?? s.templateId;
      const paletteId = opts.paletteId ?? s.paletteId;

      const palette = PALETTE_PRESETS.find((p) => p.id === paletteId);
      const tokens = palette ? palette.tokens : s.tokens;
      const typography = applyTemplateTypography(s.typography, templateId);
      const blocks = buildBlocksForTemplate(templateId, { plan, copy: s.copy, heroImage: s.heroImage });

      return {
        plan,
        templateId,
        paletteId,
        tokens,
        typography,
        blocks,
        // 重置 history：第一次 undo 不應該回到「初始化前的空 plan」
        past: [],
        future: [],
        selectedBlockId: null,
        editingBlockId: null,
      };
    }),

  restoreFromDraft: (snap) =>
    set(() => ({
      plan: snap.plan,
      blocks: snap.blocks,
      templateId: snap.templateId,
      paletteId: snap.paletteId,
      tokens: snap.tokens,
      typography: snap.typography,
      copy: snap.copy,
      heroImage: snap.heroImage,
      heroMeta: snap.heroMeta,
      // history / 暫態都重置（autosave 不還原 undo stack）
      past: [],
      future: [],
      selectedBlockId: null,
      editingBlockId: null,
    })),

  resetToInitial: () => {
    // v0.7.5.2：與 store create() 時的初始化邏輯一致；獨立計算避免 createInitialState 被
    // 後續 set 影響（zustand store create 時的 closure-captured 變數可能已被外部變更）
    const freshPlan = emptyClassPlan();
    const freshTemplate = 'classic';
    const freshPalette = PALETTE_PRESETS[0];
    const freshTypography = applyTemplateTypography(defaultTypography, freshTemplate);
    const freshBlocks = buildBlocksForTemplate(freshTemplate, { plan: freshPlan, copy: null });
    set(() => ({
      plan: freshPlan,
      blocks: freshBlocks,
      templateId: freshTemplate,
      paletteId: freshPalette.id,
      tokens: freshPalette.tokens,
      typography: freshTypography,
      copy: null,
      heroImage: undefined,
      heroMeta: {},
      past: [],
      future: [],
      selectedBlockId: null,
      editingBlockId: null,
    }));
  },

  applyCopyVersion: (newCopy) => {
    let preservedCount = 0;
    let updatedCount = 0;
    set((s) => {
      const result = applyCopyVersionToBlocks(s.blocks, newCopy);
      preservedCount = result.preservedCount;
      updatedCount = result.updatedCount;
      return { ...pushHistory(s), copy: newCopy, blocks: result.blocks };
    });
    return { preservedCount, updatedCount };
  },

  insertBlocks: (newBlocks, at = 'after-selected') => {
    if (!newBlocks || newBlocks.length === 0) return;
    set((s) => {
      let insertIdx: number;
      if (typeof at === 'number') {
        insertIdx = Math.max(0, Math.min(at, s.blocks.length));
      } else if (at === 'start') {
        insertIdx = 0;
      } else if (at === 'end') {
        insertIdx = s.blocks.length;
      } else {
        // 'after-selected'
        if (s.selectedBlockId) {
          const sel = s.blocks.findIndex((b) => b.id === s.selectedBlockId);
          insertIdx = sel >= 0 ? sel + 1 : s.blocks.length;
        } else {
          insertIdx = s.blocks.length;
        }
      }
      const next = [...s.blocks];
      next.splice(insertIdx, 0, ...newBlocks);
      return { ...pushHistory(s), blocks: next };
    });
  },

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return s;
      const previous = s.past[s.past.length - 1];
      return {
        ...previous,
        past: s.past.slice(0, -1),
        future: [snapshot(s), ...s.future],
        selectedBlockId: s.selectedBlockId,
      } as EdmState;
    }),
  redo: () =>
    set((s) => {
      if (s.future.length === 0) return s;
      const next = s.future[0];
      return {
        ...next,
        past: [...s.past, snapshot(s)],
        future: s.future.slice(1),
        selectedBlockId: s.selectedBlockId,
      } as EdmState;
    }),
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
}));

export { TEMPLATES };
