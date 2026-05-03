import type { Course } from './classPlan';
import type { ColorTokens } from './theme';

export type BlockType =
  | 'hero'
  | 'headline'
  | 'copy'
  | 'courseTable'
  | 'instructor'
  | 'cta'
  | 'image'
  | 'divider'
  | 'spacer'
  | 'footer'
  | 'classDate'
  | 'classTime';

/**
 * GeneratedCopy 中可被 mirror 進 block 的欄位。
 * 純結構性的 block（divider / spacer / classDate / classTime / instructor / footer / courseTable / 來自 plan 的 block）不對映任何欄位。
 */
export type CopyField = 'headline' | 'subheadline' | 'pain' | 'solution' | 'whyForYou' | 'cta';

/**
 * 重生器 key —— v0.4.0 partial update 用。
 *
 * 同一個 copyField 在不同 blueprint 可能有不同的呈現方式（例如 pain 在 classic 是 `<p>`、
 * 在 magazine 是 `<p><em>`、在 academic 跟 solution 合併成 `<ol>`），所以每個 (copyField, blueprint variant)
 * 對應一個獨立 key，applyCopyVersion 依此 key dispatch 到對應的重建函式。
 */
export type RegenKey =
  | 'hero:title'
  | 'headline:subheadline'
  | 'cta:label'
  | 'copy:pain:p'
  | 'copy:pain:em'
  // v0.6.0
  | 'copy:pain:lead'
  | 'copy:solution:p'
  | 'copy:solution:prepared'
  // v0.6.0
  | 'copy:solution:declarative'
  | 'copy:whyForYou:default'
  | 'copy:whyForYou:modern'
  | 'copy:whyForYou:magazine'
  | 'copy:whyForYou:vibrant'
  | 'copy:whyForYou:academic'
  // v0.6.0
  | 'copy:whyForYou:editorial'
  | 'copy:whyForYou:paper'
  | 'copy:whyForYou:kanban'
  | 'copy:whyForYou:poster'
  | 'copy:minimal-lead'
  | 'copy:academic-painSolution';

export interface BlockOrigin {
  /**
   * 這個 block 是怎麼出現的：
   * - `'blueprint'`：模板 blueprint 直接產出的結構性 block（hero / divider / classDate ...）
   * - `'copy'`：generateCopy 帶來的內容變成的 block（pain / solution / whyForYou ...）
   * - `'user'`：使用者透過 BlocksPanel 或拖曳新增的 block
   */
  source: 'blueprint' | 'copy' | 'user';
  /** 此 block 的核心內容對映到 GeneratedCopy 的哪個欄位（純結構 block 為 undefined） */
  copyField?: CopyField;
  /**
   * applyCopyVersion 切版本時用此 key 找對應的重建函式。
   * 若 undefined 表示此 block 雖然是 blueprint 來源但不需依 copy 變動（例如 divider、classDate、courseTable）
   */
  regenKey?: RegenKey;
  /**
   * 使用者已手動修改過此 block 的核心內容欄位（hero.title / copy.html / cta.label / headline.text 等）。
   * 一旦為 true，applyCopyVersion 不會再覆蓋此 block 的內容。
   * 由 store.updateBlock 自動偵測 patch 是否涉及核心欄位來設置。
   */
  edited?: boolean;
}

export interface BlockBase {
  id: string;
  type: BlockType;
  /**
   * v0.4.0 起追蹤 block 來源，用來支援 AI 文案多版本切換時的 partial update。
   * 既有資料沒有此欄位也能正常運作（會被視為「無原點資訊」處理）。
   */
  origin?: BlockOrigin;
  /**
   * v0.4.1 起：block-level palette override —— 只覆寫此 block 的 color tokens，
   * 不影響其他 block 與全域 palette。例如同一份 EDM 想要兩個 CTA 配兩種顏色，
   * 就在第二個 CTA 設 `tokensOverride: { accent: '#ff6b35', accentText: '#fff' }`。
   *
   * EditableCanvas 在 render 時會用 `{ ...tokens, ...block.tokensOverride }` 合併，
   * 沒設 override 的欄位會 fallback 到全域 tokens。
   */
  tokensOverride?: Partial<ColorTokens>;
}

export interface HeroBlock extends BlockBase {
  type: 'hero';
  image?: string;
  /**
   * Hero 圖片高度（px）。
   *
   * v0.7.0 起改為 optional，**未設定時 fallback 到當前模板的 `style.hero.imageHeight`**。
   * 這樣使用者切模板時 hero 自動套用模板建議高度；當使用者主動改變 `height` 時則尊重使用者覆寫。
   * 修這個欄位以前其實沒生效（渲染端只讀 `style.hero.imageHeight`，根本沒看 block.height）。
   */
  height?: number;
  overlay?: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
}

/**
 * 標題文字效果（v0.7.3 新增）。
 *
 * 純 CSS animation 實作（keyframes 由 EditableCanvas / EmailTemplate 注入到 <style>）。
 *
 * 信件客戶端對 CSS animation 的支援：
 *   - Apple Mail / iOS Mail：✅ 支援
 *   - Gmail web / mobile：⚠️ 部分支援（不支援 keyframes 的 client 會看到「最終靜態樣式」）
 *   - Outlook web：⚠️ 部分支援
 *   - Outlook desktop（Windows）：❌ 完全不支援，會看到「最終靜態樣式」
 *
 * 因此設計時必須確保「最終靜態樣式」本身就好看（typewriter 動畫結束後是完整文字、
 * blink 動畫期望使用者看到的是 opacity:1 的完整文字，不能讓靜態狀態消失）。
 *
 *   - `none`：無效果（預設，與 v0.7.3 之前完全一致）
 *   - `typewriter`：打字機效果 —— 文字逐字出現
 *   - `blink`：閃爍 —— opacity 在 0.4 ~ 1 間循環
 *   - `fade-in`：淡入 —— opacity 從 0 → 1
 *   - `gradient-text`：漸層文字 —— linear-gradient 套到文字上（不是動畫，是視覺效果）
 */
export type HeadlineEffect = 'none' | 'typewriter' | 'blink' | 'fade-in' | 'gradient-text';

export interface HeadlineBlock extends BlockBase {
  type: 'headline';
  text: string;
  subtitle?: string;
  /**
   * 主標題上方的「肩標」/「眼眉」（v0.7.3 新增，optional）。
   *
   * 視覺上比 title 小、比 subtitle 更靜，常用於章節編號 / 分類 / 引言。
   * 範例：`eyebrow="第三章"` + `text="如何寫出好提示"` + `subtitle="Prompt 工程入門"`。
   */
  eyebrow?: string;
  align: 'left' | 'center';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * 主標題色覆寫（v0.7.3 新增，optional hex）。未設定時 fallback 到 `tokens.textPrimary`。
   *
   * 注意：與 `block.tokensOverride.textPrimary` 不同 —— `color` 是「只給此 headline 用」的覆寫，
   * 不會被其他下游 block 看到；`tokensOverride.textPrimary` 則會「污染」整個 block 的顏色 context
   * （影響 block 內部所有用 textPrimary 的子元素）。
   */
  color?: string;
  /** 副標題色覆寫（v0.7.3 新增）。未設定時 fallback 到 `tokens.textSecondary`。 */
  subtitleColor?: string;
  /** Eyebrow 色覆寫（v0.7.3 新增）。未設定時 fallback 到 `tokens.accent`。 */
  eyebrowColor?: string;
  /**
   * 主標題自訂字級 px（v0.7.3 新增，optional）。
   * 設定後**完全覆蓋** `size` 對應的 sizeMap 值；未設定時 size 仍生效。
   * 建議範圍 12 ~ 64。
   */
  customSize?: number;
  /**
   * 主標題字重覆寫（v0.7.3 新增，optional）。100 ~ 900。
   * 未設定時 fallback 到模板 `style.headline.weight`。
   */
  weight?: number;
  /**
   * 文字效果（v0.7.3 新增）。詳見 {@link HeadlineEffect}。
   * 未設定 / `'none'` 與 v0.7.3 之前完全一致。
   */
  effect?: HeadlineEffect;
}

export interface CopyBlock extends BlockBase {
  type: 'copy';
  html: string;
}

export interface CourseTableBlock extends BlockBase {
  type: 'courseTable';
  courses: Course[];
  totalHours?: number;
  showInstructor: boolean;
  /**
   * 是否顯示班代號（如「CR25AX」）。
   *
   * v0.7.0 新增；未設定時預設 `true`（沿用先前行為，classic / banded 等樣式本來就會顯示）。
   * 在 BlockEditDialog 可由使用者切換。
   */
  showCode?: boolean;
}

export interface InstructorBlock extends BlockBase {
  type: 'instructor';
  name: string;
  role: string;
  /**
   * 講師簡介。
   *
   * 自 v0.7.1 起：可包含 sanitized HTML（由 RichTextEditor 產出，含 <p>/<strong>/<em>/<span style>...等）。
   * 為了向下相容 v0.7.0 之前的純文字資料，render 端會自動把純文字 wrap 成 <p>。
   * 渲染請務必透過 prepareInstructorBio() 做最後一道 sanitize（防止 host 注入未消毒的 HTML）。
   */
  bio?: string;
  avatar?: string;
}

/**
 * CTA 按鈕樣式（v0.7.3 擴充：原本只有 primary / outline，新增三種變體）。
 *
 *   - `primary`：實心按鈕（預設）—— bg = primary，fg = readableOn(primary)
 *   - `outline`：外框按鈕 —— bg = transparent，邊框與文字色都用 primary
 *   - `gradient`：漸層按鈕（v0.7.3 新增）—— bg = linear-gradient(135deg, gradientFrom, gradientTo)
 *     未指定 from/to 時 fallback 到 primary → accent；Outlook fallback 到實心 primary
 *   - `ghost`：透明按鈕（v0.7.3 新增）—— bg = primary 帶 0.12 alpha，文字色 = primary
 *     視覺上比 outline 還要淡，無邊框；Outlook fallback 到淡淡的 surface 色
 *   - `soft`：柔和按鈕（v0.7.3 新增）—— bg = primary 帶 0.18 alpha，文字色 = primary
 *     比 ghost 飽和度高一點，適合次要動作
 */
export type CtaStyleVariant = 'primary' | 'outline' | 'gradient' | 'ghost' | 'soft';

/**
 * CTA 按鈕圓角級距（v0.7.3 新增）。
 * `inherit`（預設）= 沿用模板 `style.cta.radius`；其餘為 block-level 覆寫。
 */
export type CtaRadiusPreset = 'inherit' | 'square' | 'sm' | 'md' | 'lg' | 'pill';

/**
 * CTA 按鈕 box-shadow 級距（v0.7.3 新增）。
 * 信件客戶端對 box-shadow 支援度：
 *   - Apple Mail / iOS Mail / Gmail web / Outlook web：✅ 支援
 *   - Outlook desktop（Windows）：❌ 完全不支援，會被忽略（不會破壞排版）
 *
 * 因此 shadow 是「漸進增強」的視覺加分，不會破壞 Outlook desktop 的排版。
 */
export type CtaShadowLevel = 'none' | 'sm' | 'md' | 'lg';

export interface CtaBlock extends BlockBase {
  type: 'cta';
  label: string;
  url: string;
  /** 樣式變體：詳見 {@link CtaStyleVariant}。舊資料只會有 `primary` / `outline`，向下相容。 */
  style: CtaStyleVariant;
  /**
   * 圓角覆寫（v0.7.3 新增）。
   * 未設定時 fallback 到模板 `style.cta.radius`（與 v0.7.3 之前的行為一致）。
   */
  radius?: CtaRadiusPreset;
  /**
   * 文字大小覆寫（v0.7.3 新增）。
   * 未設定時 fallback 到內建預設（15px）。建議範圍 12 ~ 24。
   */
  fontSize?: number;
  /**
   * Box-shadow 級距（v0.7.3 新增）。預設 `'none'`，與 v0.7.3 之前行為一致。
   */
  shadow?: CtaShadowLevel;
  /**
   * 是否「滿版按鈕」（v0.7.3 新增）。
   * true 時按鈕 width: 100%（受限於 section 內距），適合主要 CTA 強烈引導。
   */
  fullWidth?: boolean;
  /**
   * 透明度（v0.7.3 新增）。0 ~ 1，預設 1（不透明）。
   * 不建議設 < 0.5，會大幅降低點擊率與可讀性。
   */
  opacity?: number;
  /**
   * Gradient 樣式專用：起始色（hex）。當 style === 'gradient' 才生效。
   * 未設定時 fallback 到 tokens.primary。
   */
  gradientFrom?: string;
  /**
   * Gradient 樣式專用：結束色（hex）。
   * 未設定時 fallback 到 tokens.accent。
   */
  gradientTo?: string;
  secondary?: { label: string; url: string };
}

export interface ImageBlock extends BlockBase {
  type: 'image';
  src: string;
  alt: string;
  width: number;
  align: 'left' | 'center' | 'right';
  caption?: string;
}

export interface DividerBlock extends BlockBase {
  type: 'divider';
  style: 'solid' | 'dashed' | 'geometric';
}

/**
 * 空白行區塊（v0.7.2.1 新增）。
 *
 * 設計目標：在 EDM 排版中提供「視覺呼吸感」——比 divider 更彈性，純粹做為間距 / 緩衝。
 *
 * - `height`：高度 px（4 ~ 200），預設 24
 * - `background`：背景色（hex），預設 `'#000000'` 中性黑；但因為 opacity 預設 0 所以看不見
 * - `opacity`：透明度（0 ~ 1），預設 0（完全透明 = 純間距）
 *
 * 使用情境：
 *  1. **純間距**：保持預設 → 完全透明的 24px 空白行
 *  2. **柔和分隔**：opacity 0.1、background = primary 色 → 一條淡淡的色帶
 *  3. **強調分區**：opacity 1、background = accent 色、height 8 → 一條粗實色帶
 *
 * 編輯器內：opacity 為 0 時會顯示虛線框 + 標籤「空白行 Xpx」讓使用者看得到；
 * 但匯出 EDM 時完全不可見（因為信件客戶端預覽看到的是真的渲染結果）。
 */
export interface SpacerBlock extends BlockBase {
  type: 'spacer';
  /** 高度 px，建議 4 ~ 200 */
  height: number;
  /** 背景色（hex 字串），可選；undefined 視為使用 #000000（搭配 opacity 0 預設不可見） */
  background?: string;
  /** 透明度 0 ~ 1，可選；undefined 視為 0（完全透明） */
  opacity?: number;
}

export interface FooterBlock extends BlockBase {
  type: 'footer';
  text: string;
  links?: Array<{ label: string; url: string }>;
}

/** 上課日期區塊：支援多日（每筆 YYYY-MM-DD），會自動排序顯示 */
export interface ClassDateBlock extends BlockBase {
  type: 'classDate';
  /** 標籤文字，例如「上課日期」 */
  label: string;
  /** ISO 日期字串陣列 yyyy-MM-dd */
  dates: string[];
  /** 顯示樣式：摘要（首末日）或完整列表 */
  display: 'range' | 'list';
  /** 年份顯示格式：roc=民國年（預設）、gregorian=西元年。同年份只會顯示一次。 */
  yearFormat?: 'roc' | 'gregorian';
}

/** 上課時間區塊：起訖時間 HH:mm */
export interface ClassTimeBlock extends BlockBase {
  type: 'classTime';
  /** 標籤文字，例如「上課時間」 */
  label: string;
  /** 起始時間 HH:mm */
  startTime: string;
  /** 結束時間 HH:mm */
  endTime: string;
  /** 是否計算並顯示時長（例：共 2 小時） */
  showDuration: boolean;
}

export type Block =
  | HeroBlock
  | HeadlineBlock
  | CopyBlock
  | CourseTableBlock
  | InstructorBlock
  | CtaBlock
  | ImageBlock
  | DividerBlock
  | SpacerBlock
  | FooterBlock
  | ClassDateBlock
  | ClassTimeBlock;
