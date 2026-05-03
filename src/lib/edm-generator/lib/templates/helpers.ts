/**
 * 模板 blueprint 共用工廠（block factory helpers）
 *
 * 所有 blueprint 都用這層共用 helpers 產生「同類型 block」，避免每個模板各自手刻
 * `{ id: nanoid(), type: 'hero', ... }` 重複碼。每個 blueprint 只需專注在「
 * 這個模板要哪些區塊、以什麼順序、用什麼 variant 表達」。
 *
 * v0.4.0 加入 **block origin tracking**：每個 helper 產出的 block 會帶 `origin` metadata，
 * 標記「這個 block 是 blueprint 結構性 / 是 copy 內容 / 是使用者新增」，用來支援
 * AI 文案多版本切換時的 partial update（不覆蓋使用者已手動修改的 block）。
 *
 * 設計原則：
 * - **僅產生 block，不決定模板差異**：差異在 blueprint 檔自己決定要不要呼叫某個
 *   helper、傳入什麼參數。
 * - **永遠回傳 array**：方便 blueprint 用 spread 串連，或回傳空陣列讓 caller
 *   自然忽略。
 * - **plan 為 null/缺欄位時 graceful skip**：例如沒上課時間就不產 classTime block。
 */

import { nanoid } from 'nanoid';
import type {
  Block,
  BlockOrigin,
  ClassDateBlock,
  ClassTimeBlock,
  CopyBlock,
  CourseTableBlock,
  CtaBlock,
  CtaRadiusPreset,
  CtaShadowLevel,
  CtaStyleVariant,
  DividerBlock,
  SpacerBlock,
  FooterBlock,
  HeadlineBlock,
  HeadlineEffect,
  HeroBlock,
  InstructorBlock,
  RegenKey,
} from '@edm/types/blocks';
import type { ClassPlan } from '@edm/types/classPlan';
import type { GeneratedCopy } from '@edm/types/copy';
import { toIsoDate } from '@edm/lib/utils/dates';

const id = (): string => nanoid(8);

export interface BlueprintCtx {
  plan: ClassPlan;
  copy?: GeneratedCopy | null;
  heroImage?: string;
}

export function totalHoursOf(plan: ClassPlan): number {
  return plan.totalHours || plan.courses.reduce((acc, c) => acc + (c.hours || 0), 0);
}

/* ============================================================
 * Origin shorthand：高頻寫法統一在這
 * ============================================================ */

const blueprintOrigin = (): BlockOrigin => ({ source: 'blueprint' });

const blueprintMirror = (copyField: BlockOrigin['copyField'], regenKey: RegenKey): BlockOrigin => ({
  source: 'blueprint',
  copyField,
  regenKey,
});

const copyOrigin = (copyField: BlockOrigin['copyField'], regenKey: RegenKey): BlockOrigin => ({
  source: 'copy',
  copyField,
  regenKey,
});

/* ============================================================
 * 單區塊工廠（基底）
 * ============================================================ */

export function hero(opts: {
  image?: string;
  /**
   * v0.7.0：未提供時不寫入 `block.height`，讓渲染端 fallback 到當前模板的 `style.hero.imageHeight`。
   * 切模板時自動套用模板的建議高度；只有使用者主動在編輯視窗改高度才會固定值。
   */
  height?: number;
  eyebrow: string;
  title: string;
  subtitle?: string;
  overlay?: string;
  /**
   * true 表示此 hero 的 `title` mirror 自 `copy.headline`，
   * applyCopyVersion 切版本時會自動更新（除非使用者已手動編輯過 title）。
   */
  mirrorTitleToCopy?: boolean;
  /** 覆寫 origin（高階 caller 用，blueprint 一般不需要） */
  origin?: BlockOrigin;
}): HeroBlock {
  return {
    id: id(),
    type: 'hero',
    image: opts.image,
    // 只在 caller 顯式提供時才寫值；undefined 時走 style.hero.imageHeight fallback
    ...(opts.height !== undefined ? { height: opts.height } : {}),
    eyebrow: opts.eyebrow,
    title: opts.title,
    subtitle: opts.subtitle,
    overlay: opts.overlay,
    origin:
      opts.origin ??
      (opts.mirrorTitleToCopy ? blueprintMirror('headline', 'hero:title') : blueprintOrigin()),
  };
}

export function headline(opts: {
  text: string;
  subtitle?: string;
  /** v0.7.4：模板可選擇預先注入肩標（會被使用者編輯覆蓋） */
  eyebrow?: string;
  align?: 'left' | 'center';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** v0.7.4：模板可預設字重（fallback 到 style.headline.weight） */
  weight?: number;
  /** v0.7.4：模板可預設文字效果（fade-in / gradient-text 等） */
  effect?: HeadlineEffect;
  /**
   * 若設為 'subheadline'，表示此 headline 的 `text` mirror 自 `copy.subheadline`，
   * applyCopyVersion 會自動更新（除非使用者已手動編輯）。
   */
  mirrorTextToCopy?: 'subheadline';
  origin?: BlockOrigin;
}): HeadlineBlock {
  return {
    id: id(),
    type: 'headline',
    text: opts.text,
    subtitle: opts.subtitle,
    // v0.7.4：模板層 eyebrow / weight / effect 注入（皆 optional，沒設就跟 v0.7.3 完全一致）
    ...(opts.eyebrow !== undefined ? { eyebrow: opts.eyebrow } : {}),
    align: opts.align ?? 'center',
    size: opts.size ?? 'md',
    ...(opts.weight !== undefined ? { weight: opts.weight } : {}),
    ...(opts.effect !== undefined && opts.effect !== 'none' ? { effect: opts.effect } : {}),
    origin:
      opts.origin ??
      (opts.mirrorTextToCopy === 'subheadline'
        ? blueprintMirror('subheadline', 'headline:subheadline')
        : blueprintOrigin()),
  };
}

export function copy(html: string, origin?: BlockOrigin): CopyBlock {
  return { id: id(), type: 'copy', html, origin: origin ?? blueprintOrigin() };
}

export function classDate(plan: ClassPlan, label = '上課日期'): ClassDateBlock | null {
  if (!plan.classDays || plan.classDays.length === 0) return null;
  return {
    id: id(),
    type: 'classDate',
    label,
    dates: plan.classDays.map(toIsoDate),
    display: 'list',
    yearFormat: 'roc',
    origin: blueprintOrigin(),
  };
}

export function classTime(plan: ClassPlan, label = '上課時間'): ClassTimeBlock | null {
  if (!plan.startTime && !plan.endTime) return null;
  return {
    id: id(),
    type: 'classTime',
    label,
    startTime: plan.startTime,
    endTime: plan.endTime,
    showDuration: true,
    origin: blueprintOrigin(),
  };
}

export function courseTable(plan: ClassPlan, opts: { showInstructor?: boolean } = {}): CourseTableBlock | null {
  if (!plan.courses || plan.courses.length === 0) return null;
  return {
    id: id(),
    type: 'courseTable',
    courses: plan.courses,
    totalHours: totalHoursOf(plan),
    showInstructor: opts.showInstructor ?? true,
    origin: blueprintOrigin(),
  };
}

export function instructor(plan: ClassPlan, role = '導師（培訓師）'): InstructorBlock | null {
  if (!plan.mentor.name) return null;
  const bio = plan.mentor.email
    ? `聯絡：${plan.mentor.email}${plan.mentor.phone ? `　${plan.mentor.phone}` : ''}`
    : '';
  return { id: id(), type: 'instructor', name: plan.mentor.name, role, bio, origin: blueprintOrigin() };
}

export function cta(opts: {
  label: string;
  url?: string;
  /** v0.7.4：擴展為 CtaStyleVariant 5 種（向下相容 primary / outline） */
  style?: CtaStyleVariant;
  /** v0.7.4：模板可預設圓角級距（'inherit' | 'square' | 'sm' | 'md' | 'lg' | 'pill'） */
  radius?: CtaRadiusPreset;
  /** v0.7.4：模板可預設陰影級距（'none' | 'sm' | 'md' | 'lg'）。Outlook desktop 自動忽略 */
  shadow?: CtaShadowLevel;
  /** v0.7.4：模板可預設「滿版按鈕」（適合主要 CTA 強烈引導，e.g. bulletin / kanban / poster） */
  fullWidth?: boolean;
  /** v0.7.4：模板可預設字級 px（建議 12 ~ 24） */
  fontSize?: number;
  /** v0.7.4：gradient 樣式專用 — 起始色 hex（未設時 fallback tokens.primary） */
  gradientFrom?: string;
  /** v0.7.4：gradient 樣式專用 — 結束色 hex（未設時 fallback tokens.accent） */
  gradientTo?: string;
  secondary?: { label: string; url: string };
  /** true 表示此 CTA 的 `label` mirror 自 `copy.cta` */
  mirrorLabelToCopy?: boolean;
  origin?: BlockOrigin;
}): CtaBlock {
  return {
    id: id(),
    type: 'cta',
    label: opts.label,
    url: opts.url || '#',
    style: opts.style ?? 'primary',
    // v0.7.4：所有新欄位都用「未設定不寫入」的方式，保持 v0.7.3 的向下相容
    ...(opts.radius !== undefined ? { radius: opts.radius } : {}),
    ...(opts.shadow !== undefined ? { shadow: opts.shadow } : {}),
    ...(opts.fullWidth !== undefined ? { fullWidth: opts.fullWidth } : {}),
    ...(opts.fontSize !== undefined ? { fontSize: opts.fontSize } : {}),
    ...(opts.gradientFrom !== undefined ? { gradientFrom: opts.gradientFrom } : {}),
    ...(opts.gradientTo !== undefined ? { gradientTo: opts.gradientTo } : {}),
    secondary: opts.secondary,
    origin:
      opts.origin ??
      (opts.mirrorLabelToCopy ? blueprintMirror('cta', 'cta:label') : blueprintOrigin()),
  };
}

export function divider(style: 'solid' | 'dashed' | 'geometric' = 'solid'): DividerBlock {
  return { id: id(), type: 'divider', style, origin: blueprintOrigin() };
}

/**
 * 空白行 helper（v0.7.2.1）。
 * 可選參數：height（預設 24px）、background（預設 undefined → 渲染端用 #000000）、
 *          opacity（預設 undefined → 渲染端視為 0，完全透明）。
 */
export function spacer(opts: { height?: number; background?: string; opacity?: number } = {}): SpacerBlock {
  return {
    id: id(),
    type: 'spacer',
    height: opts.height ?? 24,
    ...(opts.background !== undefined ? { background: opts.background } : {}),
    ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
    origin: blueprintOrigin(),
  };
}

export function footer(text: string): FooterBlock {
  return { id: id(), type: 'footer', text, origin: blueprintOrigin() };
}

/* ============================================================
 * Copy 內容 typed builders（v0.4.0 partial update 用）
 *
 * 這些 helper 取代 blueprint 中過去散落的 `c?.pain ? copy(`<p>${c.pain}</p>`) : null`
 * 之類的寫法；它們會自動帶上正確的 `origin: { source: 'copy', copyField, regenKey }`，
 * 讓 partial update 演算法能依 regenKey 找到對應的重生函式。
 * ============================================================ */

const whyHtml = (c: GeneratedCopy, heading: string): string =>
  `<p><strong>${heading}</strong></p><ul>${c.whyForYou.map((w) => `<li>${w}</li>`).join('')}</ul>`;

const academicEffectsHtml = (c: GeneratedCopy): string =>
  `<p><strong>研習效益：</strong></p><ul>${c.whyForYou.map((w) => `<li>${w}</li>`).join('')}</ul>`;

const academicPainSolutionHtml = (c: GeneratedCopy): string => {
  const items: string[] = [];
  if (c.pain) items.push(`<li>${c.pain}</li>`);
  if (c.solution) items.push(`<li>${c.solution}</li>`);
  return `<p><strong>說明：</strong></p><ol>${items.join('')}</ol>`;
};

const minimalLeadHtml = (c: GeneratedCopy): string => {
  if (c.pain && c.solution) return `<p>${c.pain}　—　${c.solution}</p>`;
  if (c.solution) return `<p>${c.solution}</p>`;
  if (c.pain) return `<p>${c.pain}</p>`;
  return '';
};

/**
 * Pain 段落 helper —— 三種變體：
 * - `'p'`：純 `<p>${c.pain}</p>`（classic / modern / vibrant）
 * - `'em'`：`<p><em>${c.pain}</em></p>`（magazine 雜誌引言）
 * - `'lead'`（v0.6.0）：`<p><strong style="...drop-cap">{first}</strong>{rest}</p>` —— 第一字 drop-cap，editorial 模板用
 */
export function painCopy(c: GeneratedCopy | null | undefined, variant: 'p' | 'em' | 'lead' = 'p'): CopyBlock | null {
  if (!c?.pain) return null;
  let html: string;
  let regenKey: RegenKey;
  switch (variant) {
    case 'em':
      html = `<p><em>${c.pain}</em></p>`;
      regenKey = 'copy:pain:em';
      break;
    case 'lead':
      html = buildLeadHtml(c.pain);
      regenKey = 'copy:pain:lead';
      break;
    case 'p':
    default:
      html = `<p>${c.pain}</p>`;
      regenKey = 'copy:pain:p';
  }
  return copy(html, copyOrigin('pain', regenKey));
}

/**
 * Solution 段落 helper —— 三種變體：
 * - `'p'`：純 `<p>${c.solution}</p>`（modern / magazine / vibrant / minimal）
 * - `'prepared'`：`<p><strong>本班為您準備：</strong>${c.solution}</p>`（classic）
 * - `'declarative'`（v0.6.0）：`<p><strong>本班規劃 — </strong>${c.solution}</p>`（bulletin / paper / kanban 用，公告體）
 */
export function solutionCopy(
  c: GeneratedCopy | null | undefined,
  variant: 'p' | 'prepared' | 'declarative' = 'p',
): CopyBlock | null {
  if (!c?.solution) return null;
  let html: string;
  let regenKey: RegenKey;
  switch (variant) {
    case 'prepared':
      html = `<p><strong>本班為您準備：</strong>${c.solution}</p>`;
      regenKey = 'copy:solution:prepared';
      break;
    case 'declarative':
      html = `<p><strong>本班規劃 — </strong>${c.solution}</p>`;
      regenKey = 'copy:solution:declarative';
      break;
    case 'p':
    default:
      html = `<p>${c.solution}</p>`;
      regenKey = 'copy:solution:p';
  }
  return copy(html, copyOrigin('solution', regenKey));
}

/**
 * v0.6.0：editorial / paper 用的「drop-cap 第一字放大」HTML 構造器。
 *
 * 用 inline style 而非 class，原因：
 *   1) Outlook 不支援 ::first-letter 偽元素
 *   2) 用 ::first-letter 會被 React Email 的 inline 化過程抹掉
 *
 * 失敗 graceful fallback：第一字若是空白 / 空字串，會回傳普通 `<p>${text}</p>`。
 */
function buildLeadHtml(text: string): string {
  if (!text || text.length === 0) return `<p>${text}</p>`;
  const first = text.charAt(0);
  const rest = text.slice(1);
  if (first.trim() === '') return `<p>${text}</p>`;
  return `<p><span style="float:left;font-size:2.4em;line-height:1;font-weight:800;padding:4px 6px 0 0;">${first}</span>${rest}</p>`;
}

/**
 * whyForYou 段落 helper —— 9 種變體（對應 12 個模板的差異化措辭）：
 *
 * v0.3 — v0.4：
 * - `'default'`（classic）：「為什麼適合您」
 * - `'modern'`：「為什麼是現在」
 * - `'magazine'`：「此外」
 * - `'vibrant'`：「你會得到什麼」
 * - `'academic'`：「研習效益」（連 wrapper 都不一樣，無 strong 大標）
 *
 * v0.6.0 新增：
 * - `'editorial'`：「重點摘錄」（高階主管 / 領導力，刊物式條列）
 * - `'paper'`：「謹備如下」（人文 / 品德 / 傳統，謙抑語氣）
 * - `'kanban'`：「交付項目」（PMP / 敏捷，用 PM 術語）
 * - `'poster'`：「現場將呈現」（大型講座，論壇感）
 */
export function whyForYouCopy(
  c: GeneratedCopy | null | undefined,
  variant:
    | 'default'
    | 'modern'
    | 'magazine'
    | 'vibrant'
    | 'academic'
    | 'editorial'
    | 'paper'
    | 'kanban'
    | 'poster' = 'default',
): CopyBlock | null {
  if (!c?.whyForYou || c.whyForYou.length === 0) return null;
  let html: string;
  let regenKey: RegenKey;
  switch (variant) {
    case 'modern':
      html = whyHtml(c, '為什麼是現在');
      regenKey = 'copy:whyForYou:modern';
      break;
    case 'magazine':
      html = whyHtml(c, '此外');
      regenKey = 'copy:whyForYou:magazine';
      break;
    case 'vibrant':
      html = whyHtml(c, '你會得到什麼');
      regenKey = 'copy:whyForYou:vibrant';
      break;
    case 'academic':
      html = academicEffectsHtml(c);
      regenKey = 'copy:whyForYou:academic';
      break;
    case 'editorial':
      html = whyHtml(c, '重點摘錄');
      regenKey = 'copy:whyForYou:editorial';
      break;
    case 'paper':
      html = whyHtml(c, '謹備如下');
      regenKey = 'copy:whyForYou:paper';
      break;
    case 'kanban':
      html = whyHtml(c, '交付項目');
      regenKey = 'copy:whyForYou:kanban';
      break;
    case 'poster':
      html = whyHtml(c, '現場將呈現');
      regenKey = 'copy:whyForYou:poster';
      break;
    case 'default':
    default:
      html = whyHtml(c, '為什麼適合您');
      regenKey = 'copy:whyForYou:default';
  }
  return copy(html, copyOrigin('whyForYou', regenKey));
}

/** Minimal 模板特有：把 pain + solution 合併在一個 `<p>` 段落（用全形破折號分隔） */
export function minimalLeadCopy(c: GeneratedCopy | null | undefined): CopyBlock | null {
  if (!c) return null;
  if (!c.pain && !c.solution) return null;
  return copy(minimalLeadHtml(c), copyOrigin('solution', 'copy:minimal-lead'));
}

/** Academic 模板特有：公文「說明」段，把 pain / solution 合成有序清單 */
export function academicPainSolutionCopy(c: GeneratedCopy | null | undefined): CopyBlock | null {
  if (!c) return null;
  if (!c.pain && !c.solution) return null;
  return copy(academicPainSolutionHtml(c), copyOrigin('solution', 'copy:academic-painSolution'));
}

/* ============================================================
 * Plan-only 通用語意組合（不對映 GeneratedCopy 任何欄位）
 * ============================================================ */

/** 把 plan.audience / location / prerequisites 轉成單一 copy block（適合 Classic / Modern / Vibrant） */
export function buildAudienceCopy(plan: ClassPlan): CopyBlock | null {
  const parts: string[] = [];
  if (plan.location) parts.push(`<p><strong>上課方式：</strong>${plan.location}</p>`);
  if (plan.audience.length > 0) parts.push(`<p><strong>適合對象：</strong>${plan.audience.join('、')}</p>`);
  if (plan.prerequisites) parts.push(`<p><strong>預備知識：</strong>${plan.prerequisites}</p>`);
  if (parts.length === 0) return null;
  return copy(parts.join(''));
}

/** 沒有 AI copy.solution 時的後備方案：用 plan.objectives 做學習目標清單 */
export function buildObjectivesCopy(plan: ClassPlan, heading = '學習目標'): CopyBlock | null {
  if (!plan.objectives || plan.objectives.length === 0) return null;
  return copy(
    `<p><strong>${heading}</strong></p><ul>${plan.objectives.map((o) => `<li>${o}</li>`).join('')}</ul>`,
  );
}

/** 共通 footer 文字工廠 */
export function buildFooterText(plan: ClassPlan, suffix = '如有任何問題請聯繫導師。'): string {
  const senderName = plan.mentor.name ? ` ${plan.mentor.name}` : '';
  return `本訊息由中華電信學院資訊學系${senderName}發送，${suffix}`;
}

/** 把可能為 null 的 block array 攤平、過濾掉 null */
export function compact<T>(arr: Array<T | null | undefined | false>): T[] {
  return arr.filter((b): b is T => b !== null && b !== undefined && b !== false);
}

/* ============================================================
 * 重生器（applyCopyVersion 用）
 * ============================================================ */

/** 重生器：每個 RegenKey 對應一個函式，吃新版 GeneratedCopy 回傳要 patch 進 block 的部分欄位 */
export const REGENERATORS: Record<RegenKey, (c: GeneratedCopy) => Partial<Block>> = {
  'hero:title': (c) => ({ title: c.headline } as Partial<HeroBlock>),
  'headline:subheadline': (c) => ({ text: c.subheadline } as Partial<HeadlineBlock>),
  'cta:label': (c) => ({ label: c.cta } as Partial<CtaBlock>),
  'copy:pain:p': (c) => ({ html: `<p>${c.pain}</p>` } as Partial<CopyBlock>),
  'copy:pain:em': (c) => ({ html: `<p><em>${c.pain}</em></p>` } as Partial<CopyBlock>),
  'copy:pain:lead': (c) => ({ html: buildLeadHtml(c.pain) } as Partial<CopyBlock>),
  'copy:solution:p': (c) => ({ html: `<p>${c.solution}</p>` } as Partial<CopyBlock>),
  'copy:solution:prepared': (c) => ({
    html: `<p><strong>本班為您準備：</strong>${c.solution}</p>`,
  } as Partial<CopyBlock>),
  'copy:solution:declarative': (c) => ({
    html: `<p><strong>本班規劃 — </strong>${c.solution}</p>`,
  } as Partial<CopyBlock>),
  'copy:whyForYou:default': (c) => ({ html: whyHtml(c, '為什麼適合您') } as Partial<CopyBlock>),
  'copy:whyForYou:modern': (c) => ({ html: whyHtml(c, '為什麼是現在') } as Partial<CopyBlock>),
  'copy:whyForYou:magazine': (c) => ({ html: whyHtml(c, '此外') } as Partial<CopyBlock>),
  'copy:whyForYou:vibrant': (c) => ({ html: whyHtml(c, '你會得到什麼') } as Partial<CopyBlock>),
  'copy:whyForYou:academic': (c) => ({ html: academicEffectsHtml(c) } as Partial<CopyBlock>),
  // v0.6.0：4 個新模板的 whyForYou 措辭
  'copy:whyForYou:editorial': (c) => ({ html: whyHtml(c, '重點摘錄') } as Partial<CopyBlock>),
  'copy:whyForYou:paper': (c) => ({ html: whyHtml(c, '謹備如下') } as Partial<CopyBlock>),
  'copy:whyForYou:kanban': (c) => ({ html: whyHtml(c, '交付項目') } as Partial<CopyBlock>),
  'copy:whyForYou:poster': (c) => ({ html: whyHtml(c, '現場將呈現') } as Partial<CopyBlock>),
  'copy:minimal-lead': (c) => ({ html: minimalLeadHtml(c) } as Partial<CopyBlock>),
  'copy:academic-painSolution': (c) => ({ html: academicPainSolutionHtml(c) } as Partial<CopyBlock>),
};

/**
 * 把 block 套用對應 regenKey 的新內容；若 block 沒 regenKey 或 origin.edited === true 則原封不動。
 *
 * 用於 store.applyCopyVersion 的核心：
 * ```ts
 * const next = blocks.map((b) => regenerateBlockIfNeeded(b, newCopy));
 * ```
 */
export function regenerateBlockIfNeeded(block: Block, newCopy: GeneratedCopy): Block {
  if (!block.origin) return block;
  if (block.origin.edited) return block;
  if (block.origin.source === 'user') return block;
  const key = block.origin.regenKey;
  if (!key) return block;
  const regen = REGENERATORS[key];
  if (!regen) return block;
  return { ...block, ...regen(newCopy) } as Block;
}

/**
 * 每個 RegenKey 對應到 block 上的「核心內容欄位」名稱。
 * 用來判斷 updateBlock(patch) 是否動到了「會被 regenerator 覆寫的那個欄位」，
 * 進而決定要不要把 origin.edited 標為 true。
 */
const REGEN_CORE_FIELD: Record<RegenKey, 'title' | 'text' | 'label' | 'html'> = {
  'hero:title': 'title',
  'headline:subheadline': 'text',
  'cta:label': 'label',
  'copy:pain:p': 'html',
  'copy:pain:em': 'html',
  'copy:pain:lead': 'html',
  'copy:solution:p': 'html',
  'copy:solution:prepared': 'html',
  'copy:solution:declarative': 'html',
  'copy:whyForYou:default': 'html',
  'copy:whyForYou:modern': 'html',
  'copy:whyForYou:magazine': 'html',
  'copy:whyForYou:vibrant': 'html',
  'copy:whyForYou:academic': 'html',
  'copy:whyForYou:editorial': 'html',
  'copy:whyForYou:paper': 'html',
  'copy:whyForYou:kanban': 'html',
  'copy:whyForYou:poster': 'html',
  'copy:minimal-lead': 'html',
  'copy:academic-painSolution': 'html',
};

/**
 * 判斷某次 updateBlock(id, patch) 是否動到了「regenerator 會寫的那個欄位」。
 * 回傳 true 表示應該把 origin.edited 標為 true（partial update 後不再覆蓋此 block）。
 *
 * 邏輯：
 * - 若 block 沒有 regenKey（純結構 block）→ 永遠 false（partial update 反正也不動它）
 * - 若 patch 不含 regenerator 對應欄位 → false（例如改 hero.image 不算編輯 title）
 * - 若 patch 該欄位等同舊值 → false（contentEditable 經常 onBlur 觸發但內容沒變）
 */
export function isCoreFieldPatch(block: Block, patch: Partial<Block>): boolean {
  const key = block.origin?.regenKey;
  if (!key) return false;
  const field = REGEN_CORE_FIELD[key];
  if (!(field in patch)) return false;
  const newValue = (patch as Record<string, unknown>)[field];
  if (newValue === undefined) return false;
  const oldValue = (block as unknown as Record<string, unknown>)[field];
  return newValue !== oldValue;
}

/** v0.4.0 partial update 的 dispatcher 結果 */
export interface ApplyCopyVersionResult {
  /** 套用新版本後的 blocks 陣列 */
  blocks: Block[];
  /** 因 origin.edited === true 而被保留的 block 數（給 toast 顯示用） */
  preservedCount: number;
  /** 實際被 regenerator 重寫內容的 block 數 */
  updatedCount: number;
}

/**
 * 把 blocks 陣列套上新版 copy（partial update）。
 *
 * 規則：
 * 1. `origin.source === 'user'` 的 block 不動（使用者新增的塊）
 * 2. `origin.edited === true` 的 block 不動（使用者已手動編輯的塊）
 * 3. 沒有 regenKey 的 block 不動（純結構塊）
 * 4. 其餘的 block 套對應 regenerator 重寫核心內容欄位
 */
export function applyCopyVersionToBlocks(
  blocks: Block[],
  newCopy: GeneratedCopy,
): ApplyCopyVersionResult {
  let preservedCount = 0;
  let updatedCount = 0;
  const next = blocks.map((b) => {
    if (!b.origin) return b;
    if (b.origin.source === 'user') return b;
    if (b.origin.edited) {
      preservedCount++;
      return b;
    }
    const key = b.origin.regenKey;
    if (!key) return b;
    const regen = REGENERATORS[key];
    if (!regen) return b;
    updatedCount++;
    return { ...b, ...regen(newCopy) } as Block;
  });
  return { blocks: next, preservedCount, updatedCount };
}

export type AnyBlock = Block;

/* ============================================================
 * 向後相容（v0.3.x 的 API；保留以避免外部 import 壞掉）
 * ============================================================ */

/**
 * @deprecated v0.4.0 後請使用 `whyForYouCopy(c, variant)`。此 alias 暫保留給尚未遷移的測試／外部 import。
 */
export function buildWhyForYouCopy(
  c: GeneratedCopy | null | undefined,
  heading = '為什麼適合您',
): CopyBlock | null {
  // 依 heading 推回最接近的 variant；找不到就 fallback 到 default
  const map: Record<string, Parameters<typeof whyForYouCopy>[1]> = {
    為什麼適合您: 'default',
    為什麼是現在: 'modern',
    此外: 'magazine',
    你會得到什麼: 'vibrant',
  };
  return whyForYouCopy(c, map[heading] ?? 'default');
}
