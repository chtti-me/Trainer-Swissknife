import * as React from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEdmStore } from '@edm/store/edmStore';
import type { Block, ClassDateBlock, ClassTimeBlock, CourseTableBlock, HeroBlock, SpacerBlock } from '@edm/types/blocks';
import type { ColorTokens, Typography } from '@edm/types/theme';
import type { TemplateStyle } from '@edm/types/template';
import { getTemplateStyle } from '@edm/lib/templates/styles';
import { cn } from '@edm/lib/utils';
import {
  GripVertical,
  Trash2,
  Copy,
  Pencil,
  ArrowUp,
  ArrowDown,
  Palette,
  RotateCcw,
  PackagePlus,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useModulesStore } from '@edm/store/modulesStore';
import { Popover, PopoverContent, PopoverTrigger } from '@edm/components/ui/popover';
// v0.7.4：sanitizeOutgoing 從 RichTextEditor.tsx 拆到 lib/editor/sanitize（修 Fast Refresh）
import { sanitizeOutgoing } from '@edm/lib/editor/sanitize';
import { formatDateList, type YearFormat } from '@edm/lib/utils/dates';
import { isDarkHex, mixHex } from '@edm/lib/theme/colorScale';
import { prepareInstructorBio, injectParagraphMargin } from '@edm/lib/email/prepareInstructorBio';
import { withEmojiFallbackTypography } from '@edm/lib/fonts/emojiFallback';

/**
 * v0.7.0：Hero 高度的有效值 = 使用者覆寫（block.height） ?? 模板預設（style.hero.imageHeight）。
 * 與 EmailTemplate.tsx 的 heroH 同邏輯（保持編輯端 / 預覽端一致）。
 */
function heroH(b: HeroBlock, s: TemplateStyle): number {
  return b.height ?? s.hero.imageHeight;
}
import {
  getRelevantTokenFields,
  partitionTokenFields,
  type TokenFieldDef,
  type TokenKey,
} from '@edm/lib/blocks/tokenRelevance';
import {
  buildCornerBlobSvg,
  buildDiagonalBlocksSvg,
  buildGradientBarSvg,
  buildTriBandSvg,
  buildWaveDividerSvg,
} from '@edm/lib/theme/decorations';
import { computeCtaColors, getCtaRadiusPx, getCtaShadowCss, getCtaOpacity } from '@edm/lib/blocks/ctaColors';
import { computeHeroTextColors } from '@edm/lib/blocks/heroColors';
import { getEffectiveSwatchColor } from '@edm/lib/blocks/effectiveColor';
import { inlineCopyHtml } from '@edm/lib/blocks/copyInline';
import { HEADLINE_EFFECT_CSS } from '@edm/lib/email/headlineEffects';

const WIDTH = 640;
const pad2 = (n: number): string => String(n).padStart(2, '0');

interface EditableCanvasProps {
  blocks: Block[];
  tokens: ColorTokens;
  typography: Typography;
  templateId: string;
}

export function EditableCanvas({
  blocks,
  tokens,
  typography: rawTypography,
  templateId,
}: EditableCanvasProps): React.JSX.Element {
  const setBlocks = useEdmStore((s) => s.setBlocks);
  const selectBlock = useEdmStore((s) => s.selectBlock);
  const style = getTemplateStyle(templateId);
  // v0.7.2：對所有 fontFamily stack 末端附加 emoji fallback，與 EmailTemplate 一致行為
  const typography = React.useMemo(() => withEmojiFallbackTypography(rawTypography), [rawTypography]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = blocks.findIndex((b) => b.id === active.id);
    const newIdx = blocks.findIndex((b) => b.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    setBlocks(arrayMove(blocks, oldIdx, newIdx));
  };

  // 雜誌風 headline 章節編號：從 blocks list 預先算好每個 headline 的序號，
  // 避免 render-time 計數器在 StrictMode 與部分 re-render 下出現「+2 累加」bug
  const headlineNumberOf = React.useMemo(() => {
    const map = new Map<string, number>();
    let n = 0;
    for (const b of blocks) {
      if (b.type === 'headline') map.set(b.id, ++n);
    }
    return map;
  }, [blocks]);

  return (
    <div
      className="edm-editable-root mx-auto"
      style={{
        width: WIDTH,
        background: tokens.bg,
        color: tokens.textPrimary,
        fontFamily: typography.bodyFont,
        fontSize: typography.baseSize,
      }}
      onClick={() => selectBlock(null)}
    >
      {/*
       * v0.7.3：注入 Headline 文字效果 keyframes / class definitions —— 與 EmailTemplate
       * 共用同一份 HEADLINE_EFFECT_CSS，確保「編輯時看到的動畫」與「匯出 EDM 後的動畫」一致。
       *
       * 為什麼放在這個容器內而不是 document.head？
       *   - Scoping：keyframes 是 global，但 .edm-effect-* class 只我們用，不怕衝突
       *   - 可預測：跟著 EditableCanvas 一起 mount/unmount，HMR 友好
       *   - 簡單：不用 useEffect + document.createElement('style') 的 side effect 噪音
       */}
      <style dangerouslySetInnerHTML={{ __html: HEADLINE_EFFECT_CSS }} />
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          {blocks.map((b, i) => (
            <SortableBlockWrapper
              key={b.id}
              block={b}
              index={i}
              total={blocks.length}
              tokens={tokens}
              typography={typography}
              style={style}
              headlineNumber={headlineNumberOf.get(b.id) ?? 1}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableBlockWrapper({
  block,
  index,
  total,
  tokens,
  typography,
  style,
  headlineNumber,
}: {
  block: Block;
  index: number;
  total: number;
  tokens: ColorTokens;
  typography: Typography;
  style: TemplateStyle;
  headlineNumber: number;
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });
  const selectedId = useEdmStore((s) => s.selectedBlockId);
  const selectBlock = useEdmStore((s) => s.selectBlock);
  const removeBlock = useEdmStore((s) => s.removeBlock);
  const duplicateBlock = useEdmStore((s) => s.duplicateBlock);
  const moveBlock = useEdmStore((s) => s.moveBlock);
  const openBlockEditor = useEdmStore((s) => s.openBlockEditor);
  // v0.4.2.1：浮動 toolbar 加「存入模組庫」按鈕，走全域 SaveModuleDialog 路徑
  const requestSaveBlocks = useModulesStore((s) => s.requestSaveBlocks);

  const isSelected = selectedId === block.id;
  const canMoveUp = index > 0;
  const canMoveDown = index < total - 1;

  const containerStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // v0.4.4：把全域 tokens 與 block-level override 合併，給 BlockBody 用。
  // - 沒設 override 的 block 直接 reuse 全域 tokens 物件參考（不建新物件）
  // - 有 override 時用 useMemo 穩定參考，避免每次 re-render 都產生新 mergedTokens
  //   造成下游 RenderCtx 變更 → 連鎖 re-render（hero / cta / copy 等樹）
  const mergedTokens: ColorTokens = React.useMemo(
    () => (block.tokensOverride ? { ...tokens, ...block.tokensOverride } : tokens),
    [tokens, block.tokensOverride],
  );

  return (
    <div
      ref={setNodeRef}
      style={containerStyle}
      data-block-id={block.id}
      className={cn(
        'group relative transition-[outline-color,box-shadow]',
        // 沒選 / 沒 hover：邊框透明，但保留位置避免 layout shift
        'outline outline-2 outline-offset-[-2px] outline-transparent',
        // hover：淡 primary 框（提示「這個區塊可以操作」）
        'hover:outline-primary/40',
        // v0.4.2.1：選中時改成更明顯的「實線 outline + 內陰影」組合，而且不用 inset
        // outline-offset，避免被 block 內的圖／強色背景蓋住
        isSelected && 'outline-primary outline-offset-0 shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]',
      )}
      onClick={(e) => {
        e.stopPropagation();
        selectBlock(block.id);
      }}
      onDoubleClick={(e) => {
        if (isTextOnlyBlock(block)) return;
        e.stopPropagation();
        openBlockEditor(block.id);
      }}
    >
      <BlockBody block={block} tokens={mergedTokens} typography={typography} style={style} headlineNumber={headlineNumber} />

      {/* v0.4.2.1：選中時加左側垂直 bar + 左上「已選中」徽章，視覺定錨用 */}
      {isSelected && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 top-0 w-1 bg-primary"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute left-2 top-2 rounded bg-primary px-1.5 py-0.5 text-[9px] font-semibold leading-none text-primary-foreground shadow-sm"
          >
            已選中
          </div>
        </>
      )}

      {/* Hover 浮動工具列（hover 時或 selected 時都顯示） */}
      <div
        className={cn(
          'absolute right-1 top-1 flex items-center gap-0.5 rounded-md border border-border bg-background/95 px-1 py-0.5 shadow-md',
          'opacity-0 transition-opacity',
          'group-hover:opacity-100',
          isSelected && 'opacity-100',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          {...attributes}
          {...listeners}
          title="拖曳排序"
          className="cursor-grab rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button
          title="上移（Ctrl+↑）"
          disabled={!canMoveUp}
          onClick={(e) => {
            e.stopPropagation();
            if (canMoveUp) moveBlock(index, index - 1);
          }}
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          title="下移（Ctrl+↓）"
          disabled={!canMoveDown}
          onClick={(e) => {
            e.stopPropagation();
            if (canMoveDown) moveBlock(index, index + 1);
          }}
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <BlockPaletteOverride
          block={block}
          globalTokens={tokens}
          heroVariant={style.hero.variant}
        />
        <button
          title="編輯屬性"
          onClick={(e) => {
            e.stopPropagation();
            openBlockEditor(block.id);
          }}
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          title="複製（Ctrl+D）"
          onClick={(e) => {
            e.stopPropagation();
            duplicateBlock(block.id);
          }}
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          title="存入模組庫"
          onClick={(e) => {
            e.stopPropagation();
            requestSaveBlocks({
              blocks: [block],
              source: 'single-block',
              defaultName: defaultModuleNameFor(block),
            });
          }}
          className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
        >
          <PackagePlus className="h-3.5 w-3.5" />
        </button>
        <button
          title="刪除（Delete）"
          onClick={(e) => {
            e.stopPropagation();
            removeBlock(block.id);
          }}
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * v0.4.2.1：給「存入模組庫」按鈕用的預設名稱推算。
 *
 * 用 block.type + 內容首句生出一個有提示性的預設名稱，例如：
 *   - cta「立即報名」 → 「按鈕：立即報名」
 *   - hero「AI 入門班」→ 「Hero：AI 入門班」
 * 使用者大多會自己改，但有個 informative 的初值比 generic「自訂模組」好用。
 */
function defaultModuleNameFor(block: Block): string {
  const TYPE_LABEL: Record<Block['type'], string> = {
    hero: 'Hero',
    headline: '標題',
    copy: '段落',
    courseTable: '課程表',
    instructor: '講師',
    cta: '按鈕',
    image: '圖片',
    divider: '分隔線',
    spacer: '空白行',
    footer: '頁尾',
    classDate: '上課日期',
    classTime: '上課時間',
  };
  const label = TYPE_LABEL[block.type] ?? '區塊';
  let detail = '';
  if (block.type === 'cta') detail = block.label;
  else if (block.type === 'headline') detail = block.text;
  else if (block.type === 'hero') detail = block.title || '';
  else if (block.type === 'footer') detail = block.text;
  else if (block.type === 'instructor') detail = block.name;
  detail = detail.slice(0, 16).trim();
  return detail ? `${label}：${detail}` : `${label}模組`;
}

/**
 * v0.4.1：block-level palette override 浮動 popover。
 *
 * 點 🎨 按鈕跳出 popover，可單獨改此 block 配色。
 *
 * v0.4.2.2 改為 per-block-type 動態欄位：
 *   - 不再固定列 4 個 token；而是依 `block.type` 從 `BLOCK_TOKEN_RELEVANCE` 取出
 *     **真的會影響該 block 視覺**的 token 欄位。
 *   - 每個欄位旁顯示 affects 提示，告訴使用者改這個會影響哪裡。
 *   - 對於使用者既有但已不適用的覆寫（跨版本資料），仍補列出來讓使用者重置。
 *
 * 重置按鈕會把 `tokensOverride` 設回 undefined（block 重新跟隨全域 palette）。
 *
 * 注意：popover 內的 `<input type="color">` 不是 controlled —— 我們用 onChange
 * 直接觸發 updateBlock，以免在 popover 關閉後還要寫 useEffect 同步。
 */
/**
 * 單一 token 欄位（color picker + label + 重置按鈕）。
 *
 * - mode='simple'：用 simpleLabel（無 token 名稱），給 core 段；想學 Word 那種
 *   「文字色 / 背景色 / 框線色」的直觀感受。
 * - mode='advanced'：用完整 label（含 token 名稱），給 advanced 段；給進階使用者參考。
 */
function TokenField({
  field,
  mode,
  isOverridden,
  currentColor,
  globalColor,
  onChange,
  onClear,
}: {
  field: TokenFieldDef;
  mode: 'simple' | 'advanced';
  isOverridden: boolean;
  currentColor: string;
  globalColor: string;
  onChange: (value: string) => void;
  onClear: () => void;
}): React.JSX.Element {
  const displayLabel = mode === 'simple' && field.simpleLabel ? field.simpleLabel : field.label;
  return (
    <div className="flex items-start gap-2">
      <input
        type="color"
        value={currentColor}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 h-7 w-9 cursor-pointer rounded border border-border bg-transparent"
        title={`改 ${displayLabel}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 text-xs">
          <span className="font-medium">{displayLabel}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{currentColor}</span>
        </div>
        <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground/90">
          {field.affects}
        </div>
      </div>
      {isOverridden ? (
        <button
          onClick={onClear}
          className="mt-0.5 shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
          title={`此項回到全域 ${globalColor}`}
        >
          重置
        </button>
      ) : (
        <span className="mt-0.5 shrink-0 text-[10px] text-muted-foreground/50" title="目前跟隨全域">
          全域
        </span>
      )}
    </div>
  );
}

function BlockPaletteOverride({
  block,
  globalTokens,
  heroVariant,
}: {
  block: Block;
  globalTokens: ColorTokens;
  /** 由外層 SortableBlockWrapper 傳入，hero block 才用得到（決定衍生色邏輯） */
  heroVariant?: import('@edm/types/template').HeroVariant;
}): React.JSX.Element {
  const updateBlock = useEdmStore((s) => s.updateBlock);
  const overrides = block.tokensOverride ?? {};
  const hasOverride = Object.keys(overrides).length > 0;

  // v0.4.3：advanced 段預設折疊，類似 Word 那種「進階設定」的隱藏體驗
  // 但若使用者在 advanced 已有覆寫，自動展開讓他看見。
  const fields = getRelevantTokenFields(block.type, overrides);
  const { core, advanced } = partitionTokenFields(fields);
  const hasAdvancedOverride = advanced.some((f) => f.key in overrides);
  const [showAdvanced, setShowAdvanced] = React.useState<boolean>(hasAdvancedOverride);

  // v0.4.3.1：merged tokens 給 effectiveColor 用（已包含 block.tokensOverride）
  // v0.4.4：用 useMemo 穩定參考；overrides 來自 block.tokensOverride，當 block 有更新時才重算
  const mergedTokens: ColorTokens = React.useMemo(
    () => ({ ...globalTokens, ...overrides }),
    [globalTokens, overrides],
  );

  const setToken = (key: TokenKey, value: string): void => {
    updateBlock(block.id, {
      tokensOverride: { ...overrides, [key]: value },
    } as Partial<Block>);
  };

  const clearToken = (key: TokenKey): void => {
    const next = { ...overrides };
    delete next[key];
    updateBlock(block.id, {
      tokensOverride: Object.keys(next).length > 0 ? next : undefined,
    } as Partial<Block>);
  };

  const resetAll = (): void => {
    updateBlock(block.id, { tokensOverride: undefined } as Partial<Block>);
  };

  const renderField = (field: TokenFieldDef, mode: 'simple' | 'advanced'): React.JSX.Element => {
    const isOverridden = field.key in overrides;
    // v0.4.3.1：色票顯示「實際生效色」而不是「全域 token 字典值」，
    // 跟使用者眼睛在 EDM 上看到的色保持一致（避免 cta.textPrimary 顯示黑灰但按鈕實際是白字的困惑）。
    const currentColor = getEffectiveSwatchColor(block, field.key, mergedTokens, heroVariant);
    return (
      <TokenField
        key={field.key}
        field={field}
        mode={mode}
        isOverridden={isOverridden}
        currentColor={currentColor}
        globalColor={globalTokens[field.key] as string}
        onChange={(v) => setToken(field.key, v)}
        onClear={() => clearToken(field.key)}
      />
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          title={hasOverride ? `已覆寫 ${Object.keys(overrides).length} 個顏色（點開調整）` : '單獨調此區塊顏色'}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'rounded p-1 hover:bg-secondary hover:text-foreground',
            hasOverride ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          <Palette className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 space-y-3"
        side="bottom"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">此區塊配色</div>
          {hasOverride && (
            <button
              onClick={resetAll}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              title="清除所有覆寫，跟隨全域 palette"
            >
              <RotateCcw className="h-3 w-3" />
              全部重置
            </button>
          )}
        </div>
        {fields.length === 0 ? (
          <p className="rounded bg-muted/40 p-2 text-[11px] leading-tight text-muted-foreground">
            此區塊類型沒有可單獨調整的色彩欄位。
          </p>
        ) : (
          <>
            {/* 常用色（core，預設展開）—— 學 Word 文字前景色 / 背景色 / 框線色那種直觀體驗 */}
            {core.length > 0 && (
              <div className="space-y-2.5">
                {core.map((f) => renderField(f, 'simple'))}
              </div>
            )}
            {/* 進階色（advanced，預設折疊）—— 給進階使用者保留彈性 */}
            {advanced.length > 0 && (
              <div className="border-t border-border pt-2">
                <button
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="flex w-full items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  type="button"
                >
                  {showAdvanced ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  <span>進階配色（{advanced.length}）</span>
                  {hasAdvancedOverride && (
                    <span
                      className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-primary"
                      title="進階已有覆寫"
                    />
                  )}
                </button>
                {showAdvanced && (
                  <div className="mt-2 space-y-2.5">
                    {advanced.map((f) => renderField(f, 'advanced'))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        <p className="text-[10px] leading-tight text-muted-foreground">
          只影響此區塊；沒覆寫的欄位會自動跟著全域 palette 變動。常用色已直接列出，其他色請展開「進階配色」。
        </p>
      </PopoverContent>
    </Popover>
  );
}

function isTextOnlyBlock(b: Block): boolean {
  return (
    b.type === 'headline' ||
    b.type === 'copy' ||
    b.type === 'footer' ||
    b.type === 'hero' ||
    b.type === 'cta'
  );
}

interface BlockBodyProps {
  block: Block;
  tokens: ColorTokens;
  typography: Typography;
  style: TemplateStyle;
  /** 此區塊若為 headline，是第幾個 headline（用於 Magazine 章節編號） */
  headlineNumber: number;
}

function BlockBody({ block, tokens, typography, style, headlineNumber }: BlockBodyProps): React.JSX.Element {
  const updateBlock = useEdmStore((s) => s.updateBlock);

  switch (block.type) {
    case 'hero':
      return <HeroEditable block={block} tokens={tokens} typography={typography} style={style} updateBlock={updateBlock} />;

    case 'headline': {
      const sizeMap = { sm: 14, md: 18, lg: 24, xl: 30 } as const;
      // v0.7.3：customSize 完全覆蓋 sizeMap
      const baseSize = block.customSize ?? sizeMap[block.size ?? 'lg'];
      const align = block.align || style.headline.align;
      const sectionNumber = style.headline.showSectionNumber ? pad2(headlineNumber) : null;
      const titleFontFamily = style.headline.useDisplayFont
        ? typography.displayFont ?? typography.headingFont
        : typography.headingFont;
      const eyebrowFontFamily =
        style.id === 'magazine' ? typography.accentFont ?? typography.headingFont : typography.bodyFont;

      // v0.7.3：色彩 / 字重覆寫
      const titleColor = block.color ?? tokens.textPrimary;
      const subtitleColor = block.subtitleColor ?? tokens.textSecondary;
      const eyebrowColor = block.eyebrowColor ?? tokens.accent;
      const titleWeight = block.weight ?? style.headline.weight;

      // v0.7.3：effect className —— gradient-text 同時設 backgroundImage（讓 background-clip 有東西可 clip）
      const effectClassName = block.effect && block.effect !== 'none'
        ? `edm-effect-${block.effect}`
        : '';
      const gradientTextStyle: React.CSSProperties = block.effect === 'gradient-text'
        ? {
            backgroundImage: `linear-gradient(135deg, ${tokens.primary} 0%, ${tokens.accent} 100%)`,
          }
        : {};

      return (
        <section
          style={{
            padding: `${style.section.paddingY}px ${style.section.paddingX}px 8px ${style.section.paddingX}px`,
            textAlign: align as React.CSSProperties['textAlign'],
            position: 'relative' as const,
          }}
        >
          {sectionNumber && (
            <div
              style={{
                fontSize: 64,
                lineHeight: 1,
                color: tokens.accent,
                fontFamily: typography.displayFont ?? typography.headingFont,
                opacity: 0.18,
                fontWeight: 700,
                marginBottom: -16,
              }}
            >
              {sectionNumber}
            </div>
          )}

          {/* v0.7.3：eyebrow（小肩標）—— 在編輯器以 EditableText 呈現，雙擊可改 */}
          {block.eyebrow !== undefined && (
            <EditableText
              text={block.eyebrow}
              placeholder="肩標 / Eyebrow（雙擊編輯）"
              onCommit={(v) => updateBlock(block.id, { eyebrow: v || undefined })}
              style={{
                margin: '0 0 6px 0',
                fontSize: 11,
                letterSpacing: '0.18em',
                textTransform: 'uppercase' as const,
                fontWeight: 700,
                color: eyebrowColor,
                fontFamily: eyebrowFontFamily,
              }}
            />
          )}

          <EditableText
            text={block.text}
            placeholder="標題（雙擊編輯）"
            onCommit={(v) => updateBlock(block.id, { text: v })}
            className={effectClassName}
            style={{
              margin: 0,
              fontSize: baseSize,
              fontWeight: titleWeight,
              letterSpacing: `${style.headline.letterSpacing}em`,
              lineHeight: 1.3,
              color: titleColor,
              fontFamily: titleFontFamily,
              ...gradientTextStyle,
            }}
          />
          {style.headline.showAccentRule && (
            <div
              style={{
                width: 36,
                height: 2,
                backgroundColor: tokens.accent,
                margin: align === 'center' ? '12px auto 0 auto' : '12px 0 0 0',
              }}
            />
          )}
          {block.subtitle !== undefined && (
            <EditableText
              text={block.subtitle ?? ''}
              placeholder="副標"
              onCommit={(v) => updateBlock(block.id, { subtitle: v })}
              style={{
                margin: '10px 0 0 0',
                color: subtitleColor,
                fontSize: 14,
                lineHeight: 1.6,
              }}
            />
          )}
        </section>
      );
    }

    case 'copy':
      return (
        <section style={{ padding: `12px ${style.section.paddingX}px` }}>
          <EditableHtml
            html={block.html}
            onCommit={(html) => updateBlock(block.id, { html })}
            tokens={tokens}
            typography={typography}
          />
        </section>
      );

    case 'courseTable':
      return <CourseTableEditable block={block} tokens={tokens} typography={typography} style={style} />;

    case 'instructor':
      return (
        <section style={{ padding: `20px ${style.section.paddingX}px`, display: 'flex', gap: 12 }}>
          {block.avatar && (
            <img
              src={block.avatar}
              alt={block.name}
              style={{ width: 56, height: 56, borderRadius: '50%', display: 'block' }}
            />
          )}
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: '0.18em',
                color: tokens.accent,
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              {block.role}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: tokens.textPrimary, marginTop: 4 }}>
              {block.name}
            </div>
            {block.bio && (
              <div
                className="edm-instructor-bio"
                style={{ fontSize: 13, color: tokens.textSecondary, lineHeight: 1.6, marginTop: 4 }}
                dangerouslySetInnerHTML={{
                  __html: injectParagraphMargin(prepareInstructorBio(block.bio), '0 0 6px 0'),
                }}
              />
            )}
          </div>
        </section>
      );

    case 'cta': {
      const cta = style.cta;
      // v0.4.2.3：與預覽端共用 computeCtaColors，確保「編輯」與「預覽」對 CTA 顏色判讀一致
      // v0.7.3：與 EmailTemplate.CtaRenderer 同步擴充 —— gradient 用 backgroundImage、
      //         shadow / fullWidth / opacity / radius / fontSize 都受 block 覆寫。
      const { bg, gradientCss, fg, border } = computeCtaColors(block, tokens);
      const templateDefaultRadius = cta.shape === 'square' ? 0 : cta.radius;
      const radius = getCtaRadiusPx(block.radius, templateDefaultRadius);
      const shadow = getCtaShadowCss(block.shadow);
      const opacity = getCtaOpacity(block.opacity);
      const fontSize = block.fontSize ?? 15;
      const fullWidth = block.fullWidth === true;
      return (
        <section style={{ padding: `24px ${style.section.paddingX}px`, textAlign: 'center' as const }}>
          <span
            style={{
              display: fullWidth ? 'block' : 'inline-block',
              width: fullWidth ? '100%' : undefined,
              backgroundColor: bg,
              ...(gradientCss ? { backgroundImage: gradientCss } : {}),
              color: fg,
              padding: `${cta.paddingY}px ${cta.paddingX}px`,
              fontSize,
              fontWeight: cta.weight,
              letterSpacing: `${cta.letterSpacing}em`,
              borderRadius: radius,
              border,
              cursor: 'text',
              textAlign: 'center' as const,
              textTransform: cta.uppercase ? ('uppercase' as const) : ('none' as const),
              boxSizing: 'border-box' as const,
              ...(shadow !== 'none' ? { boxShadow: shadow } : {}),
              ...(opacity < 1 ? { opacity } : {}),
            }}
          >
            <EditableText
              text={block.label}
              placeholder="按鈕文字"
              onCommit={(v) => updateBlock(block.id, { label: v })}
              inline
              style={{ color: 'inherit', display: 'inline' }}
            />
          </span>
          {block.secondary && (
            <div style={{ marginTop: 12 }}>
              <span style={{ color: tokens.textSecondary, fontSize: 13, textDecoration: 'underline' }}>
                {block.secondary.label}
              </span>
            </div>
          )}
        </section>
      );
    }

    case 'image':
      return (
        <section
          style={{
            padding: `12px ${style.section.paddingX}px`,
            textAlign: block.align as React.CSSProperties['textAlign'],
          }}
        >
          {block.src ? (
            <img
              src={block.src}
              alt={block.alt}
              width={block.width}
              style={{ maxWidth: '100%', height: 'auto', display: 'inline-block', borderRadius: 6 }}
            />
          ) : (
            <div
              style={{
                width: block.width,
                maxWidth: '100%',
                height: 160,
                background: tokens.surface,
                border: `2px dashed ${tokens.border}`,
                color: tokens.textSecondary,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              雙擊設定圖片網址
            </div>
          )}
          {block.caption && (
            <div style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 8 }}>{block.caption}</div>
          )}
        </section>
      );

    case 'divider': {
      // 使用者選了非 solid 的具體樣式 → 尊重使用者
      if (block.style === 'dashed') {
        return (
          <section style={{ padding: `8px ${style.section.paddingX}px` }}>
            <div style={{ borderTop: `1px dashed ${tokens.border}`, margin: 0 }} />
          </section>
        );
      }
      if (block.style === 'geometric') {
        const url = buildGradientBarSvg(tokens.primary, tokens.accent, 640, 6);
        return (
          <section style={{ padding: `20px ${style.section.paddingX}px` }}>
            <img src={url} alt="" style={{ width: '100%', height: 6, display: 'block' }} />
          </section>
        );
      }
      // solid → 走模板的 divider variant
      return <DividerByTemplate variant={style.divider} tokens={tokens} typography={typography} style={style} />;
    }

    case 'spacer':
      return <SpacerView block={block} />;

    case 'classDate':
      return <ClassDateView block={block} tokens={tokens} style={style} />;

    case 'classTime':
      return <ClassTimeView block={block} tokens={tokens} style={style} />;

    case 'footer': {
      const footerStyle = style.footer.style;
      if (footerStyle === 'accent') {
        const url = buildGradientBarSvg(tokens.primary, tokens.accent, 640, 4);
        return (
          <>
            <img src={url} alt="" style={{ width: '100%', height: 4, display: 'block' }} />
            <section
              style={{
                padding: `20px ${style.section.paddingX}px 28px ${style.section.paddingX}px`,
                backgroundColor: tokens.surface,
                color: tokens.textSecondary,
              }}
            >
              <EditableText
                text={block.text}
                placeholder="頁尾文字"
                onCommit={(v) => updateBlock(block.id, { text: v })}
                style={{ margin: 0, fontSize: 12, lineHeight: 1.7 }}
              />
            </section>
          </>
        );
      }
      if (footerStyle === 'formal') {
        return (
          <section
            style={{
              padding: `20px ${style.section.paddingX}px 28px ${style.section.paddingX}px`,
              borderTop: `2px solid ${tokens.primary}`,
              color: tokens.textSecondary,
            }}
          >
            <div style={{ borderTop: `1px solid ${tokens.border}`, marginTop: 4, marginBottom: 14 }} />
            <EditableText
              text={block.text}
              placeholder="頁尾文字"
              onCommit={(v) => updateBlock(block.id, { text: v })}
              style={{ margin: 0, fontSize: 12, lineHeight: 1.7 }}
            />
          </section>
        );
      }
      // minimal
      return (
        <section
          style={{
            padding: `28px ${style.section.paddingX}px 36px ${style.section.paddingX}px`,
            color: tokens.textSecondary,
          }}
        >
          <div style={{ width: 32, height: 1, backgroundColor: tokens.textSecondary, marginBottom: 16 }} />
          <EditableText
            text={block.text}
            placeholder="頁尾文字"
            onCommit={(v) => updateBlock(block.id, { text: v })}
            style={{ margin: 0, fontSize: 12, lineHeight: 1.7 }}
          />
        </section>
      );
    }

    default:
      return <></>;
  }
}

// ---------------------------------------------------------------------------
// Hero（6 種變體，與 EmailTemplate 對應）
// ---------------------------------------------------------------------------

interface HeroEditableProps {
  block: HeroBlock;
  tokens: ColorTokens;
  typography: Typography;
  style: TemplateStyle;
  updateBlock: (id: string, patch: Partial<HeroBlock>) => void;
}

function HeroEditable(props: HeroEditableProps): React.JSX.Element {
  switch (props.style.hero.variant) {
    case 'modern':
      return <HeroEditableModern {...props} />;
    case 'minimal':
      return <HeroEditableMinimal {...props} />;
    case 'magazine':
      return <HeroEditableMagazine {...props} />;
    case 'academic':
      return <HeroEditableAcademic {...props} />;
    case 'vibrant':
      return <HeroEditableVibrant {...props} />;
    case 'classic':
    default:
      return <HeroEditableClassic {...props} />;
  }
}

function HeroEditableClassic({ block, tokens, typography, style, updateBlock }: HeroEditableProps): React.JSX.Element {
  // v0.4.3：與預覽端共用 computeHeroTextColors，使用者明確覆寫 textPrimary / textSecondary 一律勝出
  const heroColors = computeHeroTextColors(block, tokens, 'classic');
  return (
    <section style={{ background: tokens.bg }}>
      {block.image ? (
        <img
          src={block.image}
          alt=""
          style={{ width: '100%', height: heroH(block, style), objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div
          style={{
            background: `linear-gradient(135deg, ${tokens.primary} 0%, ${tokens.secondary} 100%)`,
            height: heroH(block, style),
            width: '100%',
          }}
        />
      )}
      <div style={{ padding: '24px 32px', background: tokens.secondary, textAlign: 'center' as const }}>
        {block.eyebrow !== undefined && (
          <div style={{ color: heroColors.eyebrow, fontSize: 11, letterSpacing: '0.22em', fontWeight: 600, textTransform: 'uppercase' }}>
            <EditableText
              text={block.eyebrow ?? ''}
              placeholder="eyebrow（雙擊編輯）"
              onCommit={(v) => updateBlock(block.id, { eyebrow: v })}
              inline
              style={{ color: 'inherit' }}
            />
          </div>
        )}
        <EditableText
          text={block.title ?? ''}
          placeholder="主視覺標題"
          onCommit={(v) => updateBlock(block.id, { title: v })}
          style={{
            margin: '10px 0 0 0',
            color: heroColors.title,
            fontSize: style.hero.titleSize,
            fontWeight: style.hero.titleWeight,
            lineHeight: 1.2,
            letterSpacing: `${style.hero.titleLetterSpacing}em`,
            fontFamily: typography.headingFont,
          }}
        />
        {style.hero.showAccentRule && (
          <div style={{ width: 48, height: 1, backgroundColor: tokens.accent, margin: '14px auto' }} />
        )}
        <EditableText
          text={block.subtitle ?? ''}
          placeholder="副標"
          onCommit={(v) => updateBlock(block.id, { subtitle: v })}
          style={{
            margin: 0,
            color: heroColors.subtitle,
            fontSize: style.hero.subtitleSize,
            letterSpacing: '0.04em',
          }}
        />
      </div>
    </section>
  );
}

function HeroEditableModern({ block, tokens, typography, style, updateBlock }: HeroEditableProps): React.JSX.Element {
  // v0.4.3：title 預設白字、subtitle 預設衍生灰白；使用者明確覆寫一律勝出
  const heroColors = computeHeroTextColors(block, tokens, 'modern');
  const blobUrl = buildCornerBlobSvg(tokens.primary, tokens.accent, WIDTH, heroH(block, style));
  return (
    <section style={{ background: tokens.secondary }}>
      <div
        style={{
          height: block.image ? heroH(block, style) : heroH(block, style) + 60,
          backgroundColor: tokens.secondary,
          backgroundImage: `url("${blobUrl}")`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: '100% 100%',
        }}
      >
        {block.image && (
          <img
            src={block.image}
            alt=""
            style={{ width: '100%', height: heroH(block, style), objectFit: 'cover', display: 'block', opacity: 0.55 }}
          />
        )}
      </div>
      <div style={{ padding: '28px 32px 32px 32px', background: tokens.secondary }}>
        {block.eyebrow !== undefined && (
          <span
            style={{
              display: 'inline-block',
              backgroundColor: tokens.accent,
              color: heroColors.eyebrow,
              padding: '4px 12px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase' as const,
            }}
          >
            <EditableText
              text={block.eyebrow ?? ''}
              placeholder="標籤"
              onCommit={(v) => updateBlock(block.id, { eyebrow: v })}
              inline
              style={{ color: 'inherit' }}
            />
          </span>
        )}
        <EditableText
          text={block.title ?? ''}
          placeholder="主視覺標題"
          onCommit={(v) => updateBlock(block.id, { title: v })}
          style={{
            margin: '14px 0 0 0',
            color: heroColors.title,
            fontSize: style.hero.titleSize,
            fontWeight: style.hero.titleWeight,
            lineHeight: 1.15,
            letterSpacing: `${style.hero.titleLetterSpacing}em`,
            fontFamily: typography.headingFont,
          }}
        />
        <EditableText
          text={block.subtitle ?? ''}
          placeholder="副標"
          onCommit={(v) => updateBlock(block.id, { subtitle: v })}
          style={{
            margin: '8px 0 0 0',
            color: heroColors.subtitle,
            fontSize: style.hero.subtitleSize,
            fontFamily: typography.accentFont ?? typography.bodyFont,
            letterSpacing: '0.06em',
          }}
        />
      </div>
    </section>
  );
}

function HeroEditableMinimal({ block, tokens, typography, style, updateBlock }: HeroEditableProps): React.JSX.Element {
  const heroColors = computeHeroTextColors(block, tokens, 'minimal');
  return (
    <section style={{ background: tokens.bg }}>
      <div style={{ padding: '64px 48px 48px 48px' }}>
        {block.eyebrow !== undefined && (
          <EditableText
            text={block.eyebrow ?? ''}
            placeholder="EYEBROW"
            onCommit={(v) => updateBlock(block.id, { eyebrow: v })}
            style={{
              margin: 0,
              fontSize: 11,
              letterSpacing: '0.32em',
              color: heroColors.eyebrow,
              fontWeight: 600,
              textTransform: 'uppercase' as const,
            }}
          />
        )}
        <EditableText
          text={block.title ?? ''}
          placeholder="主視覺標題"
          onCommit={(v) => updateBlock(block.id, { title: v })}
          style={{
            margin: '24px 0 0 0',
            color: heroColors.title,
            fontSize: style.hero.titleSize,
            fontWeight: style.hero.titleWeight,
            lineHeight: 1.15,
            fontFamily: typography.displayFont ?? typography.headingFont,
          }}
        />
        <EditableText
          text={block.subtitle ?? ''}
          placeholder="副標"
          onCommit={(v) => updateBlock(block.id, { subtitle: v })}
          style={{
            margin: '12px 0 0 0',
            color: heroColors.subtitle,
            fontSize: style.hero.subtitleSize,
            letterSpacing: '0.04em',
          }}
        />
        <div style={{ width: 64, height: 1, backgroundColor: heroColors.title, marginTop: 32 }} />
      </div>
      {block.image && (
        <div style={{ padding: '0 48px 48px 48px' }}>
          <img
            src={block.image}
            alt=""
            style={{
              width: '100%',
              height: heroH(block, style),
              objectFit: 'cover',
              display: 'block',
            }}
          />
        </div>
      )}
    </section>
  );
}

function HeroEditableMagazine({ block, tokens, typography, style, updateBlock }: HeroEditableProps): React.JSX.Element {
  const heroColors = computeHeroTextColors(block, tokens, 'magazine');
  return (
    <section style={{ background: tokens.bg }}>
      <div
        style={{
          padding: '36px 40px 12px 40px',
          borderBottom: `1px solid ${tokens.border}`,
          fontFamily: typography.accentFont ?? typography.headingFont,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.24em',
            color: heroColors.eyebrow,
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          <EditableText
            text={block.eyebrow ?? 'ISSUE · COURSE'}
            placeholder="ISSUE · COURSE"
            onCommit={(v) => updateBlock(block.id, { eyebrow: v })}
            inline
            style={{ color: 'inherit' }}
          />
        </div>
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.24em',
            color: heroColors.eyebrow,
            textTransform: 'uppercase',
          }}
        >
          中華電信學院
        </div>
      </div>
      <div style={{ display: 'flex', gap: 24, padding: '32px 40px' }}>
        <div style={{ flexShrink: 0 }}>
          {block.image ? (
            <img
              src={block.image}
              alt=""
              style={{ width: 240, height: heroH(block, style), objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div
              style={{
                width: 240,
                height: heroH(block, style),
                background: `linear-gradient(135deg, ${tokens.primary} 0%, ${tokens.accent} 100%)`,
              }}
            />
          )}
        </div>
        <div style={{ flex: 1 }}>
          <EditableText
            text={block.title ?? ''}
            placeholder="主視覺標題"
            onCommit={(v) => updateBlock(block.id, { title: v })}
            style={{
              margin: 0,
              color: heroColors.title,
              fontSize: style.hero.titleSize,
              fontWeight: style.hero.titleWeight,
              lineHeight: 1.1,
              letterSpacing: `${style.hero.titleLetterSpacing}em`,
              fontFamily: typography.displayFont ?? typography.headingFont,
            }}
          />
          <EditableText
            text={block.subtitle ?? ''}
            placeholder="副標"
            onCommit={(v) => updateBlock(block.id, { subtitle: v })}
            style={{
              margin: '14px 0 0 0',
              color: heroColors.subtitle,
              fontSize: style.hero.subtitleSize,
              fontFamily: typography.accentFont ?? typography.bodyFont,
              letterSpacing: '0.04em',
            }}
          />
        </div>
      </div>
    </section>
  );
}

function HeroEditableAcademic({ block, tokens, typography, style, updateBlock }: HeroEditableProps): React.JSX.Element {
  // v0.4.3：academic 班代號預設用 tokens.primary 強調，但使用者覆寫 textSecondary 一律勝出
  const heroColors = computeHeroTextColors(block, tokens, 'academic');
  const triBand = buildTriBandSvg(tokens.primary, tokens.accent, tokens.secondary, WIDTH, 6);
  return (
    <section style={{ background: tokens.bg }}>
      <img src={triBand} alt="" style={{ width: '100%', height: 6, display: 'block' }} />
      <div
        style={{
          padding: '14px 32px',
          borderBottom: `1px solid ${tokens.border}`,
          backgroundColor: tokens.surface,
          fontSize: 12,
          color: heroColors.eyebrow,
          letterSpacing: '0.18em',
          textTransform: 'uppercase' as const,
          fontWeight: 700,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <EditableText
          text={block.eyebrow ?? '公告 NOTICE'}
          placeholder="公告 NOTICE"
          onCommit={(v) => updateBlock(block.id, { eyebrow: v })}
          inline
          style={{ color: 'inherit' }}
        />
        <span style={{ color: heroColors.subtitle, fontWeight: 700 }}>
          <EditableText
            text={block.subtitle ?? ''}
            placeholder="班代號"
            onCommit={(v) => updateBlock(block.id, { subtitle: v })}
            inline
            style={{ color: 'inherit' }}
          />
        </span>
      </div>
      {block.image ? (
        <img
          src={block.image}
          alt=""
          style={{ width: '100%', height: heroH(block, style), objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div
          style={{
            background: `linear-gradient(135deg, ${tokens.primary} 0%, ${tokens.secondary} 100%)`,
            height: heroH(block, style),
            width: '100%',
          }}
        />
      )}
      <div style={{ padding: '24px 32px', textAlign: 'center' as const }}>
        <EditableText
          text={block.title ?? ''}
          placeholder="主視覺標題"
          onCommit={(v) => updateBlock(block.id, { title: v })}
          style={{
            margin: 0,
            color: heroColors.title,
            fontSize: style.hero.titleSize,
            fontWeight: style.hero.titleWeight,
            lineHeight: 1.3,
            letterSpacing: `${style.hero.titleLetterSpacing}em`,
            fontFamily: typography.headingFont,
          }}
        />
        {style.hero.showAccentRule && (
          <div style={{ width: 64, height: 2, backgroundColor: tokens.accent, margin: '14px auto 0 auto' }} />
        )}
      </div>
    </section>
  );
}

function HeroEditableVibrant({ block, tokens, typography, style, updateBlock }: HeroEditableProps): React.JSX.Element {
  const heroColors = computeHeroTextColors(block, tokens, 'vibrant');
  const bgUrl = block.image
    ? undefined
    : buildDiagonalBlocksSvg(tokens.primary, tokens.secondary, tokens.accent, WIDTH, heroH(block, style));

  return (
    <section style={{ background: tokens.bg }}>
      <div
        style={{
          height: heroH(block, style),
          backgroundColor: tokens.primary,
          backgroundImage: bgUrl ? `url("${bgUrl}")` : undefined,
          backgroundRepeat: 'no-repeat',
          backgroundSize: '100% 100%',
        }}
      >
        {block.image && (
          <img
            src={block.image}
            alt=""
            style={{ width: '100%', height: heroH(block, style), objectFit: 'cover', display: 'block' }}
          />
        )}
      </div>
      <div style={{ padding: '24px 32px 28px 32px', background: tokens.bg }}>
        {block.eyebrow !== undefined && (
          <span
            style={{
              display: 'inline-block',
              backgroundColor: tokens.accent,
              color: heroColors.eyebrow,
              padding: '6px 14px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase' as const,
            }}
          >
            <EditableText
              text={block.eyebrow ?? ''}
              placeholder="標籤"
              onCommit={(v) => updateBlock(block.id, { eyebrow: v })}
              inline
              style={{ color: 'inherit' }}
            />
          </span>
        )}
        <EditableText
          text={block.title ?? ''}
          placeholder="主視覺標題"
          onCommit={(v) => updateBlock(block.id, { title: v })}
          style={{
            margin: '14px 0 0 0',
            color: heroColors.title,
            fontSize: style.hero.titleSize,
            fontWeight: style.hero.titleWeight,
            lineHeight: 1.15,
            letterSpacing: `${style.hero.titleLetterSpacing}em`,
            fontFamily: typography.headingFont,
          }}
        />
        <EditableText
          text={block.subtitle ?? ''}
          placeholder="副標"
          onCommit={(v) => updateBlock(block.id, { subtitle: v })}
          style={{
            margin: '8px 0 0 0',
            color: heroColors.subtitle,
            fontSize: style.hero.subtitleSize,
          }}
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Course Table（Editable，三種主要視覺：classic / banded / card / minimal / formal）
// ---------------------------------------------------------------------------

interface CourseTableEditableProps {
  block: CourseTableBlock;
  tokens: ColorTokens;
  typography: Typography;
  style: TemplateStyle;
}

function CourseTableEditable({ block, tokens, typography, style }: CourseTableEditableProps): React.JSX.Element {
  switch (style.courseTable) {
    case 'card':
      return <CourseTableCardView block={block} tokens={tokens} typography={typography} style={style} />;
    case 'banded':
      return <CourseTableBandedView block={block} tokens={tokens} style={style} />;
    case 'minimal':
      return <CourseTableMinimalView block={block} tokens={tokens} typography={typography} style={style} />;
    case 'formal':
      return <CourseTableFormalView block={block} tokens={tokens} style={style} />;
    case 'classic':
    default:
      return <CourseTableClassicView block={block} tokens={tokens} style={style} />;
  }
}

function SectionTitle({ children, tokens }: { children: React.ReactNode; tokens: ColorTokens }): React.JSX.Element {
  return (
    <div
      style={{
        fontSize: 12,
        letterSpacing: '0.18em',
        color: tokens.accent,
        fontWeight: 700,
        textTransform: 'uppercase',
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function CourseTableClassicView({ block, tokens, style }: { block: CourseTableBlock; tokens: ColorTokens; style: TemplateStyle }): React.JSX.Element {
  return (
    <section style={{ padding: `16px ${style.section.paddingX}px` }}>
      <SectionTitle tokens={tokens}>· 課程內容 ·</SectionTitle>
      <table cellPadding={0} cellSpacing={0} style={{ width: '100%', borderCollapse: 'collapse', border: `1px solid ${tokens.border}` }}>
        <thead>
          <tr style={{ background: tokens.surface }}>
            <th align="left" style={thS(tokens)}>課程</th>
            <th align="center" style={{ ...thS(tokens), width: 60 }}>時數</th>
            {block.showInstructor && <th align="left" style={{ ...thS(tokens), width: 100 }}>主講</th>}
          </tr>
        </thead>
        <tbody>
          {block.courses.length === 0 && (
            <tr>
              <td colSpan={block.showInstructor ? 3 : 2} style={{ padding: 24, textAlign: 'center', color: tokens.textSecondary, fontSize: 12 }}>
                尚未加入課程（雙擊編輯）
              </td>
            </tr>
          )}
          {block.courses.map((c, i) => (
            <tr key={i}>
              <td style={tdS(tokens)}>
                {c.name}
                {block.showCode !== false && c.code && (
                  <span style={{ color: tokens.textSecondary, fontSize: 11, marginLeft: 8 }}>{c.code}</span>
                )}
              </td>
              <td align="center" style={tdS(tokens)}>{c.hours}</td>
              {block.showInstructor && (
                <td style={{ ...tdS(tokens), color: tokens.textSecondary, fontSize: 13 }}>{c.instructor || '—'}</td>
              )}
            </tr>
          ))}
          {typeof block.totalHours === 'number' && block.totalHours > 0 && (
            <tr style={{ background: tokens.surface }}>
              <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700 }}>合計</td>
              <td align="center" style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700 }}>{block.totalHours}</td>
              {block.showInstructor && <td />}
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function CourseTableBandedView({ block, tokens, style }: { block: CourseTableBlock; tokens: ColorTokens; style: TemplateStyle }): React.JSX.Element {
  return (
    <section style={{ padding: `16px ${style.section.paddingX}px` }}>
      <SectionTitle tokens={tokens}>課程內容</SectionTitle>
      {block.courses.map((c, i) => (
        <div
          key={i}
          style={{
            padding: '14px 16px',
            backgroundColor: i % 2 === 0 ? tokens.surface : tokens.bg,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 14,
            color: tokens.textPrimary,
          }}
        >
          <div>
            <strong style={{ color: tokens.primary }}>{pad2(i + 1)}</strong>
            <span style={{ marginLeft: 12 }}>{c.name}</span>
            {block.showCode !== false && c.code && (
              <span style={{ color: tokens.textSecondary, fontSize: 11, marginLeft: 8 }}>{c.code}</span>
            )}
          </div>
          <div style={{ fontSize: 13, color: tokens.textSecondary }}>
            {c.hours} 小時
            {block.showInstructor && c.instructor && (
              <span style={{ marginLeft: 12, color: tokens.textPrimary, fontWeight: 600 }}>{c.instructor}</span>
            )}
          </div>
        </div>
      ))}
      {block.courses.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: tokens.textSecondary, fontSize: 12 }}>
          尚未加入課程
        </div>
      )}
      {typeof block.totalHours === 'number' && block.totalHours > 0 && (
        <div style={{ marginTop: 12, textAlign: 'right', fontSize: 13, color: tokens.textPrimary, fontWeight: 700 }}>
          合計 {block.totalHours} 小時
        </div>
      )}
    </section>
  );
}

function CourseTableCardView({ block, tokens, typography, style }: CourseTableEditableProps): React.JSX.Element {
  void typography;
  const cardBg = isDarkHex(tokens.bg) ? mixHex(tokens.primary, tokens.bg, 0.1) : tokens.surface;
  return (
    <section style={{ padding: `16px ${style.section.paddingX}px` }}>
      <SectionTitle tokens={tokens}>COURSE LINEUP</SectionTitle>
      {block.courses.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: tokens.textSecondary, fontSize: 12 }}>
          尚未加入課程
        </div>
      )}
      {block.courses.map((c, i) => (
        <div
          key={i}
          style={{
            backgroundColor: cardBg,
            marginBottom: 10,
            borderLeft: `3px solid ${tokens.accent}`,
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: '0.16em', color: tokens.accent, fontWeight: 700 }}>
            MODULE {pad2(i + 1)} · {c.hours} HRS
          </div>
          <div style={{ fontSize: 15, color: tokens.textPrimary, fontWeight: 700, marginTop: 4 }}>
            {c.name}
          </div>
          {block.showInstructor && c.instructor && (
            <div style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 2 }}>
              主講：{c.instructor}
            </div>
          )}
        </div>
      ))}
      {typeof block.totalHours === 'number' && block.totalHours > 0 && (
        <div style={{ textAlign: 'right', fontSize: 13, color: tokens.textSecondary, letterSpacing: '0.06em', marginTop: 8 }}>
          TOTAL · {block.totalHours} HOURS
        </div>
      )}
    </section>
  );
}

function CourseTableMinimalView({ block, tokens, typography, style }: CourseTableEditableProps): React.JSX.Element {
  return (
    <section style={{ padding: `16px ${style.section.paddingX}px` }}>
      {block.courses.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: tokens.textSecondary, fontSize: 12, borderTop: `1px solid ${tokens.border}`, borderBottom: `1px solid ${tokens.border}` }}>
          尚未加入課程
        </div>
      )}
      {block.courses.map((c, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 16,
            padding: '14px 0',
            borderTop: i === 0 ? `1px solid ${tokens.border}` : 'none',
            borderBottom: `1px solid ${tokens.border}`,
          }}
        >
          <div style={{ width: 36, fontSize: 11, color: tokens.textSecondary, fontFamily: typography.accentFont ?? typography.bodyFont }}>
            {pad2(i + 1)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, color: tokens.textPrimary, fontFamily: typography.displayFont ?? typography.headingFont, fontWeight: 500 }}>
              {c.name}
            </div>
            {block.showInstructor && c.instructor && (
              <div style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 2 }}>{c.instructor}</div>
            )}
          </div>
          <div style={{ width: 60, textAlign: 'right', fontSize: 13, color: tokens.textSecondary }}>{c.hours}h</div>
        </div>
      ))}
    </section>
  );
}

function CourseTableFormalView({ block, tokens, style }: { block: CourseTableBlock; tokens: ColorTokens; style: TemplateStyle }): React.JSX.Element {
  return (
    <section style={{ padding: `16px ${style.section.paddingX}px` }}>
      <SectionTitle tokens={tokens}>課程內容</SectionTitle>
      <table cellPadding={0} cellSpacing={0} style={{ width: '100%', borderCollapse: 'collapse', border: `2px solid ${tokens.primary}` }}>
        <thead>
          <tr style={{ backgroundColor: tokens.primary }}>
            <th align="left" style={{ ...thS(tokens), color: '#FFFFFF', borderBottom: 'none', padding: '12px' }}>課程名稱</th>
            <th align="center" style={{ ...thS(tokens), color: '#FFFFFF', borderBottom: 'none', width: 60, padding: '12px' }}>時數</th>
            {block.showInstructor && (
              <th align="left" style={{ ...thS(tokens), color: '#FFFFFF', borderBottom: 'none', width: 100, padding: '12px' }}>主講</th>
            )}
          </tr>
        </thead>
        <tbody>
          {block.courses.length === 0 && (
            <tr>
              <td colSpan={block.showInstructor ? 3 : 2} style={{ padding: 24, textAlign: 'center', color: tokens.textSecondary, fontSize: 12 }}>
                尚未加入課程
              </td>
            </tr>
          )}
          {block.courses.map((c, i) => (
            <tr key={i}>
              <td style={{ ...tdS(tokens), borderRight: `1px solid ${tokens.border}` }}>{c.name}</td>
              <td align="center" style={{ ...tdS(tokens), borderRight: `1px solid ${tokens.border}` }}>{c.hours}</td>
              {block.showInstructor && (
                <td style={{ ...tdS(tokens), color: tokens.textSecondary, fontSize: 13 }}>{c.instructor || '—'}</td>
              )}
            </tr>
          ))}
          {typeof block.totalHours === 'number' && block.totalHours > 0 && (
            <tr style={{ backgroundColor: tokens.surface }}>
              <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: tokens.primary }}>合計</td>
              <td align="center" style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: tokens.accent }}>{block.totalHours}</td>
              {block.showInstructor && <td />}
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 其他輔助元件
// ---------------------------------------------------------------------------

/**
 * 空白行的編輯端渲染（v0.7.2.1）。
 *
 * 與 EmailTemplate.SpacerRenderer 不同：完全透明（opacity 0）時，
 * 編輯器仍要顯示一個視覺占位讓使用者點得到、看得到 — 用虛線框 + 中央標籤
 * 「空白行 24px」。匯出 EDM 時這層占位不會出現。
 */
function SpacerView({ block }: { block: SpacerBlock }): React.JSX.Element {
  const height = Math.max(1, Math.min(400, block.height || 1));
  const opacity = typeof block.opacity === 'number' ? Math.max(0, Math.min(1, block.opacity)) : 0;
  const background = block.background ?? '#000000';
  const visible = opacity > 0;

  if (visible) {
    // 真的有顏色 / 透明度 → 直接渲染（與預覽 1:1 一致）
    return (
      <div style={{ height, backgroundColor: background, opacity, lineHeight: '1px', fontSize: 1 }} aria-hidden />
    );
  }

  // 完全透明 → 顯示虛線占位（避免使用者看不到自己加了什麼）
  return (
    <div
      style={{
        height,
        position: 'relative',
        background:
          'repeating-linear-gradient(45deg, rgba(99,102,241,0.04) 0 6px, rgba(99,102,241,0.10) 6px 12px)',
        border: '1px dashed rgba(99,102,241,0.45)',
        borderRadius: 4,
        boxSizing: 'border-box',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: 10,
          color: 'rgba(79,70,229,0.85)',
          fontWeight: 600,
          letterSpacing: '0.08em',
          background: 'rgba(255,255,255,0.85)',
          padding: '1px 6px',
          borderRadius: 3,
          whiteSpace: 'nowrap',
        }}
      >
        空白行 {height}px
      </span>
    </div>
  );
}

function ClassDateView({ block, tokens, style }: { block: ClassDateBlock; tokens: ColorTokens; style: TemplateStyle }): React.JSX.Element {
  return (
    <section style={{ padding: `8px ${style.section.paddingX}px` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div
          style={{
            width: 96,
            fontSize: 13,
            fontWeight: 700,
            color: tokens.accent,
            letterSpacing: '0.12em',
            flexShrink: 0,
            paddingTop: 6,
          }}
        >
          {block.label}
        </div>
        <div style={{ fontSize: 14, color: tokens.textPrimary, lineHeight: 1.7, paddingTop: 6 }}>
          {formatDateList(block.dates, {
            display: block.display,
            yearFormat: (block.yearFormat as YearFormat | undefined) ?? 'roc',
          })}
        </div>
      </div>
    </section>
  );
}

function ClassTimeView({ block, tokens, style }: { block: ClassTimeBlock; tokens: ColorTokens; style: TemplateStyle }): React.JSX.Element {
  const dur = computeDur(block.startTime, block.endTime);
  return (
    <section style={{ padding: `8px ${style.section.paddingX}px` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            width: 96,
            fontSize: 13,
            fontWeight: 700,
            color: tokens.accent,
            letterSpacing: '0.12em',
            flexShrink: 0,
          }}
        >
          {block.label}
        </div>
        <div style={{ fontSize: 14, color: tokens.textPrimary }}>
          {block.startTime || '—'} – {block.endTime || '—'}
          {block.showDuration && dur && (
            <span style={{ color: tokens.textSecondary, marginLeft: 12, fontSize: 12 }}>（共 {dur}）</span>
          )}
        </div>
      </div>
    </section>
  );
}

function DividerByTemplate({
  variant,
  tokens,
  typography,
  style,
}: {
  variant: TemplateStyle['divider'];
  tokens: ColorTokens;
  typography: Typography;
  style: TemplateStyle;
}): React.JSX.Element {
  const padX = style.section.paddingX;
  switch (variant) {
    case 'thin-line':
      return (
        <section style={{ padding: `12px ${padX}px` }}>
          <div style={{ borderTop: `1px solid ${tokens.border}` }} />
        </section>
      );
    case 'double-line':
      return (
        <section style={{ padding: `16px ${padX}px` }}>
          <div style={{ borderTop: `1px solid ${tokens.accent}` }} />
          <div style={{ borderTop: `1px solid ${tokens.accent}`, marginTop: 4 }} />
        </section>
      );
    case 'gradient-bar': {
      const url = buildGradientBarSvg(tokens.primary, tokens.accent, 640, 6);
      return (
        <section style={{ padding: `20px ${padX}px` }}>
          <img src={url} alt="" style={{ width: '100%', height: 6, display: 'block' }} />
        </section>
      );
    }
    case 'wave': {
      const url = buildWaveDividerSvg(tokens.accent, 640, 32);
      return (
        <section style={{ padding: `12px ${padX}px` }}>
          <img src={url} alt="" style={{ width: '100%', height: 32, display: 'block' }} />
        </section>
      );
    }
    case 'dots':
      return (
        <section style={{ padding: `16px ${padX}px`, textAlign: 'center' as const }}>
          <span style={{ color: tokens.accent, fontSize: 14, letterSpacing: '0.5em' }}>• • •</span>
        </section>
      );
    case 'serif-numeral':
      return (
        <section style={{ padding: `20px ${padX}px`, textAlign: 'center' as const }}>
          <span
            style={{
              color: tokens.accent,
              fontSize: 18,
              letterSpacing: '0.3em',
              fontFamily: typography.accentFont ?? typography.headingFont,
              fontStyle: 'italic',
            }}
          >
            ※
          </span>
        </section>
      );
    case 'tri-band': {
      const url = buildTriBandSvg(tokens.primary, tokens.accent, tokens.secondary, 640, 6);
      return (
        <section style={{ padding: `12px ${padX}px` }}>
          <img src={url} alt="" style={{ width: '100%', height: 6, display: 'block' }} />
        </section>
      );
    }
    default:
      return (
        <section style={{ padding: `8px ${padX}px` }}>
          <div style={{ borderTop: `1px solid ${tokens.border}` }} />
        </section>
      );
  }
}

function thS(tokens: ColorTokens): React.CSSProperties {
  return {
    padding: '10px 12px',
    fontSize: 12,
    color: tokens.textSecondary,
    fontWeight: 600,
    borderBottom: `1px solid ${tokens.border}`,
  };
}

function tdS(tokens: ColorTokens): React.CSSProperties {
  return {
    padding: '12px',
    fontSize: 14,
    color: tokens.textPrimary,
    borderBottom: `1px solid ${tokens.border}`,
  };
}

function computeDur(start: string, end: string): string | null {
  const ms = (s: string): number | null => {
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  };
  const s = ms(start);
  const e = ms(end);
  if (s == null || e == null || e <= s) return null;
  const mins = e - s;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} 分鐘`;
  if (m === 0) return `${h} 小時`;
  return `${h} 小時 ${m} 分`;
}

// ---------------------------------------------------------------------------
// EditableText / EditableHtml（沿用前一版的元件）
// ---------------------------------------------------------------------------

function EditableText({
  text,
  placeholder,
  onCommit,
  style,
  inline,
  className,
}: {
  text: string;
  placeholder?: string;
  onCommit: (v: string) => void;
  style?: React.CSSProperties;
  inline?: boolean;
  /**
   * v0.7.3 新增：把 className 透傳到 wrapper 元素，讓 headline.effect 的 .edm-effect-*
   * 動畫 class 能套到實際 render 出來的標題上（typewriter / blink / fade-in / gradient-text）。
   */
  className?: string;
}): React.JSX.Element {
  const [editing, setEditing] = React.useState(false);
  const ref = React.useRef<HTMLElement>(null);
  const isComposing = React.useRef(false);

  React.useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(ref.current);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }, [editing]);

  const commit = (): void => {
    const v = ref.current?.innerText.trim() ?? '';
    setEditing(false);
    if (v !== text) onCommit(v);
  };

  const cancel = (): void => {
    if (ref.current) ref.current.innerText = text;
    setEditing(false);
  };

  const Tag = (inline ? 'span' : 'div') as 'span';

  if (!editing) {
    return (
      <Tag
        data-edm-editable
        className={className}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        title="雙擊編輯"
        style={{
          ...style,
          cursor: 'text',
          opacity: text ? 1 : 0.5,
          minHeight: text ? undefined : '1em',
        }}
      >
        {text || placeholder || ''}
      </Tag>
    );
  }

  return (
    <Tag
      ref={ref as React.RefObject<HTMLSpanElement>}
      className={className}
      contentEditable
      suppressContentEditableWarning
      onBlur={commit}
      onCompositionStart={() => {
        isComposing.current = true;
      }}
      onCompositionEnd={() => {
        isComposing.current = false;
      }}
      onKeyDown={(e) => {
        if (isComposing.current) return;
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          (e.target as HTMLElement).blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      onPaste={(e) => {
        e.preventDefault();
        const t = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, t);
      }}
      style={{
        ...style,
        outline: '2px solid rgba(59,130,246,0.6)',
        outlineOffset: 2,
        borderRadius: 2,
        cursor: 'text',
      }}
    >
      {text}
    </Tag>
  );
}

function EditableHtml({
  html,
  onCommit,
  tokens,
  typography,
}: {
  html: string;
  onCommit: (html: string) => void;
  tokens: ColorTokens;
  typography: Typography;
}): React.JSX.Element {
  const [editing, setEditing] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const isComposing = React.useRef(false);

  React.useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.innerHTML = html;
    }
  }, [editing, html]);

  if (!editing) {
    // v0.7.4.3：non-edit 分支套用 inlineCopyHtml，與 EmailTemplate.CopyRenderer 共用同一條
    // inline-style 注入邏輯。確保「編輯模式」與「預覽 / 匯出」三端視覺一致 ——
    // 之前直接 dangerouslySetInnerHTML 導致 <ol> 沒 padding-left、看不到「1.」編號。
    const inlined = html
      ? inlineCopyHtml(html, tokens)
      : '<p style="opacity:0.5">雙擊輸入段落內容…</p>';
    return (
      <div
        data-edm-editable
        onDoubleClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        title="雙擊編輯（也可在屬性面板使用所見即所得編輯器）"
        style={{
          color: tokens.textPrimary,
          fontSize: typography.baseSize,
          lineHeight: 1.75,
          cursor: 'text',
        }}
        dangerouslySetInnerHTML={{ __html: inlined }}
      />
    );
  }

  const commit = (): void => {
    const next = sanitizeOutgoing(ref.current?.innerHTML ?? '');
    setEditing(false);
    if (next !== html) onCommit(next);
  };

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={commit}
      onCompositionStart={() => {
        isComposing.current = true;
      }}
      onCompositionEnd={() => {
        isComposing.current = false;
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          (e.target as HTMLElement).blur();
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
      }}
      style={{
        color: tokens.textPrimary,
        fontSize: typography.baseSize,
        lineHeight: 1.75,
        outline: '2px solid rgba(59,130,246,0.6)',
        outlineOffset: 2,
        borderRadius: 2,
        padding: 4,
        minHeight: 32,
      }}
    />
  );
}
