import * as React from 'react';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Link as LinkIcon,
  Eraser,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Palette,
  Highlighter,
  ChevronDown,
  AArrowUp,
  AArrowDown,
  CaseSensitive,
  Sticker,
} from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import { cn } from '@edm/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@edm/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@edm/components/ui/dialog';
import {
  FONT_REGISTRY,
  ensureFontsLoaded,
  type FontCategory,
  type FontDef,
} from '@edm/lib/fonts';
import {
  MATERIAL_ICONS,
  MATERIAL_ICON_CATEGORY_LABEL,
  MATERIAL_ICON_CATEGORY_ORDER,
  buildMaterialIconHtml,
  type MaterialIconCategory,
  type MaterialIconDef,
} from '@edm/lib/fonts/materialIcons';
// v0.7.4：sanitizeOutgoing 從本檔拆到獨立檔，讓 RichTextEditor.tsx 純 export 元件，恢復 Fast Refresh
import { sanitizeOutgoing } from '@edm/lib/editor/sanitize';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  className?: string;
}

/**
 * 簡易所見即所得編輯器：基於 contentEditable + document.execCommand。
 *
 * v0.7.1 升級：
 *   - 新增 toolbar：字級（5 級）、文字色（10 色快速選 + 自訂）、背景色、對齊（4 種）
 *   - sanitizeOutgoing 改為「白名單 inline style」：保留 color / background-color / font-size /
 *     text-align 四個 Outlook 相容屬性，其他 style 一律剔除
 *   - <font size> / <font color> 自動轉為 <span style>，符合現代 HTML
 *
 * 設計原則：產出乾淨、Outlook 友善的 HTML。所有顏色 / 字級都用 inline style，
 * 不產出 class，因此跨郵件客戶端表現一致。
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = '在此輸入內容…',
  minHeight = 120,
  className,
}: RichTextEditorProps): React.JSX.Element {
  const ref = React.useRef<HTMLDivElement>(null);
  const isComposing = React.useRef(false);
  const lastEmitted = React.useRef<string>('');

  /**
   * v0.7.4.2：保存最近一次「在編輯器內」的 selection range。
   *
   * 為什麼需要：使用者選一段文字 → 點工具列 picker（字級 / 字型 / 顏色 / 連結）→
   * Radix Popover/Dialog 開啟時會把 focus 拉進 popover content（為了 a11y），
   * contentEditable 的 selection 雖然不一定會「視覺上消失」，但 `window.getSelection()`
   * 在 popover focus 之後 query 出來常常是空的，套用全部 no-op。
   *
   * 修法：監聽 `selectionchange`，每次 selection 落在 editor root 內就 cloneRange 存起來。
   * picker 套用時呼叫 `restoreSelection()`，把 range 套回 `window.getSelection()` 後再
   * focus editor，selection 重新 active → wrapInlineSpanStyle / execCommand 都能 work。
   *
   * 一個關鍵細節：`selectionchange` 在 popover 內 click input / button 也會觸發，
   * 但那時 selection range 在 popover 內、`editor.contains(commonAncestor)` 為 false，
   * 因此**不會覆蓋** savedRangeRef，editor 內最後一次的有效 selection 才被保留。
   */
  const savedRangeRef = React.useRef<Range | null>(null);

  React.useEffect(() => {
    const handler = () => {
      const editor = ref.current;
      if (!editor) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange();
      }
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, []);

  /**
   * 把 savedRangeRef 套回 window.getSelection 並 focus editor，
   * 讓後續 wrapInlineSpanStyle / execCommand 找得到「使用者剛剛選的文字」。
   *
   * 順序很關鍵：
   *   1. focus editor —— 否則 contentEditable 的 selection 不 active
   *   2. removeAllRanges + addRange —— 用 savedRangeRef 強制覆蓋
   *
   * 反過來先 addRange 再 focus 在某些瀏覽器（特別是 Firefox）會被 focus 重置 caret。
   */
  const restoreSelection = React.useCallback((): boolean => {
    const editor = ref.current;
    const range = savedRangeRef.current;
    if (!editor || !range) return false;
    editor.focus({ preventScroll: true });
    const sel = window.getSelection();
    if (!sel) return false;
    try {
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    } catch {
      return false;
    }
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value !== lastEmitted.current && el.innerHTML !== value) {
      el.innerHTML = value || '';
    }
  }, [value]);

  const emit = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const cleaned = sanitizeOutgoing(el.innerHTML);
    lastEmitted.current = cleaned;
    // v0.7.2.1：sanitize 結果為空但 DOM 仍殘留 <br> / <p><br></p> 時主動清空 innerHTML，
    // 讓 :empty 重新成立 → placeholder hint 自然回來。
    // 觸發情境：使用者全選後按 Backspace / Delete，瀏覽器留下視覺空殼。
    if (cleaned === '' && el.innerHTML !== '') {
      el.innerHTML = '';
    }
    onChange(cleaned);
  }, [onChange]);

  /**
   * v0.7.4.2：所有 toolbar action 共用「先 restore selection」入口。
   *
   * 不再單純 `ref.current?.focus()` —— 那只 focus editor，但若使用者剛從 picker 回來，
   * selection 可能已被清空，光 focus 會把 caret 放到 editor 開頭，原本選的文字就 unselect。
   * restoreSelection() 把 savedRangeRef 套回去後才呼叫 execCommand，使用者「選某段文字 → 點按鈕」
   * 的肌肉記憶才會 work。
   */
  const exec = (cmd: string, arg?: string) => {
    restoreSelection();
    document.execCommand(cmd, false, arg);
    emit();
  };

  // v0.7.4.2：promptLink 改用 dialog（顯示文字 + 網址雙欄位），交由 LinkDialog 元件處理
  const [linkDialogOpen, setLinkDialogOpen] = React.useState(false);
  const openLinkDialog = () => {
    // 開 dialog 前先 restore，這樣 dialog 確認時的 selection 仍指向使用者剛選的文字
    restoreSelection();
    setLinkDialogOpen(true);
  };

  // v0.7.4.8：FontSizeDropdown 的「自訂…」入口開 CustomFontSizeDialog
  const [customFontSizeDialogOpen, setCustomFontSizeDialogOpen] = React.useState(false);
  const openCustomFontSizeDialog = () => {
    // 同 LinkDialog：先 restore，dialog 提交時 selection 仍在原本選取的文字
    restoreSelection();
    setCustomFontSizeDialogOpen(true);
  };

  /**
   * 套用連結（v0.7.4.2）：
   *   - 有顯示文字 → insertHTML 一個 `<a href>顯示文字</a>`（取代選取範圍 / caret 插入）
   *   - 顯示文字空 + 有選取 → execCommand('createLink')，連結文字就是被選取那段
   *   - 顯示文字空 + 沒選取 → 直接插入 `<a>url</a>`，文字 = url
   */
  const applyLink = (url: string, displayText: string) => {
    const cleanUrl = url.trim();
    if (!cleanUrl) return;
    restoreSelection();
    const sel = window.getSelection();
    const hasSelection = sel && sel.rangeCount > 0 && sel.toString().length > 0;
    const text = displayText.trim();
    if (text) {
      const html = `<a href="${escapeAttr(cleanUrl)}">${escapeHtml(text)}</a>`;
      document.execCommand('insertHTML', false, html);
    } else if (hasSelection) {
      document.execCommand('createLink', false, cleanUrl);
    } else {
      const html = `<a href="${escapeAttr(cleanUrl)}">${escapeHtml(cleanUrl)}</a>`;
      document.execCommand('insertHTML', false, html);
    }
    emit();
  };

  const stripFormatting = () => {
    restoreSelection();
    document.execCommand('removeFormat', false);
    document.execCommand('unlink', false);
    emit();
  };

  /**
   * 套用字級（v0.7.4.1 重寫）。
   *
   * # 為什麼從 `execCommand('fontSize')` 改走 `wrapInlineSpanStyle`
   *
   * 原本實作：
   *   1. `document.execCommand('fontSize', false, '7')` → 產生 `<font size="7">`
   *   2. 自己 walk 把 `<font size="7">` 替換成 `<span style="font-size:Xpx">`
   *
   * 這在「使用者已選了顏色 → 再改字級」場景會抹掉色彩，根因：
   *   - 使用者選色：選取範圍變 `<font color="red">hello</font>`
   *   - 再選字級：`fontSize` 命令在 Chrome 會跟既有 `<font>` **合併簡化**
   *     → 變成 `<font size="7" color="red">hello</font>`
   *   - 我們的替換邏輯只認 `size` 屬性、把整個 `<font>` 換成 `<span style="font-size:Xpx">`
   *     **完全沒讀 color 屬性 → 顏色直接丟失**
   *
   * 改用 `wrapInlineSpanStyle('font-size', ...)` 之後：
   *   - 用 `range.surroundContents()` **外層包** 一層 `<span style="font-size:Xpx">`
   *   - 內部既有的 `<span style="color:..">` 或 `<font color="..">` 結構**完全保留**
   *   - 同時也擺脫「`fontSize` 命令只接受 1-7」的限制 → 任意 px 都可
   */
  const applyFontSize = (px: number) => {
    restoreSelection();
    wrapInlineSpanStyle('font-size', `${px}px`, ref.current, emit);
  };

  /**
   * 字級「再大一點 / 再小一點」步進按鈕用（v0.7.4.1，v0.7.4.2 加 restoreSelection）。
   *
   * 偵測選取範圍**起始 element** 的 computed `font-size` 為基準，加減 delta px 後套用。
   * 步進範圍 clamp 到 1 ~ 999 px（v0.7.4.8 配合「自訂」入口放寬，使用者可在 dropdown 設
   * 例如 200px 後再用 toolbar 的 +2/-2 微調）。
   * v0.7.4.2：先 restoreSelection，否則 picker 開啟後 getCurrentFontSize 讀到的是 fallback 14。
   */
  const stepFontSize = (delta: number) => {
    restoreSelection();
    const current = getCurrentFontSize(ref.current);
    const next = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, current + delta));
    applyFontSize(next);
  };

  /**
   * 套用文字色（v0.7.4.2 加 restoreSelection）：
   * execCommand('foreColor') 在 Chrome / Edge 會產生 `<font color="...">`，
   * 在 Firefox 會產生 `<span style="color:...">`。sanitizeOutgoing 會統一轉成 span。
   */
  const applyForeColor = (color: string) => {
    exec('foreColor', color);
  };

  /**
   * 套用背景色（v0.7.4.2 加 restoreSelection）：
   * Chrome / Edge / Safari 用 'hiliteColor'，Firefox 也支援；
   * 'backColor' 在 Chrome 會作用到整個 block 而非選取文字 → 不採用。
   */
  const applyBackColor = (color: string) => {
    exec('hiliteColor', color);
  };

  /**
   * 套用字型（v0.7.4.2 加 restoreSelection）。
   *
   * execCommand('fontName') 會產生 `<font face="...">`，但 face 不能完整表達
   * 「Inter, -apple-system, sans-serif」這類含 fallback chain 的 stack。
   * 我們改用自己的 wrapInlineSpanStyle helper，包成 `<span style="font-family:...">`。
   *
   * 同時透過 ensureFontsLoaded() 動態載入該字型的 Google Fonts CSS（如果尚未載入）。
   */
  const applyFontFamily = (font: FontDef) => {
    ensureFontsLoaded([font.id]);
    restoreSelection();
    wrapInlineSpanStyle('font-family', font.cssFamily, ref.current, emit);
  };

  /**
   * 插入 Material Symbols icon 到 caret 位置（不需先選取文字，但需 restoreSelection）。
   * 結構：`<span style="font-family:'Material Symbols Outlined';font-size:20px">home</span>`
   * 字型 ligature 機制會把 "home" 自動 render 成 home icon。
   *
   * v0.7.4.2：picker 開啟後 caret 被 popover focus 拉走，不 restoreSelection 會插到 editor 最前端。
   */
  const insertMaterialIcon = (icon: MaterialIconDef) => {
    ensureFontsLoaded(['material-symbols-outlined']);
    if (!ref.current) return;
    restoreSelection();
    document.execCommand('insertHTML', false, buildMaterialIconHtml(icon.name));
    emit();
  };

  return (
    <div className={cn('rounded-md border border-border bg-background', className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 p-1">
        <ToolbarButton title="粗體 (Ctrl/Cmd+B)" onClick={() => exec('bold')}>
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="斜體 (Ctrl/Cmd+I)" onClick={() => exec('italic')}>
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>

        <Separator />

        <FontFamilyPicker onPick={applyFontFamily} />

        {/*
         * v0.7.4.5：字級三件式（Word 風 toolbar） ── 字級下拉式選單 + 字體加大 + 字體縮小
         *
         * 之前 v0.7.4.2 把步進按鈕塞在 popover 內、配 datalist hint，使用者反應「沒看到下拉、按鈕沒反應」。
         * 改回 Word 真正的設計：toolbar 上**三件並排可直接操作**，下拉只是其一。
         */}
        <FontSizeDropdown
          onPick={applyFontSize}
          onCustom={openCustomFontSizeDialog}
          getCurrent={() => getCurrentFontSize(ref.current)}
        />
        <ToolbarButton
          title="字體加大 (+2px)"
          onClick={() => stepFontSize(+2)}
        >
          <AArrowUp className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="字體縮小 (-2px)"
          onClick={() => stepFontSize(-2)}
        >
          <AArrowDown className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ColorPicker
          icon={<Palette className="h-3.5 w-3.5" />}
          title="文字顏色（先選取一段文字再選色）"
          presetColors={FORE_PRESET_COLORS}
          onPick={applyForeColor}
        />
        <ColorPicker
          icon={<Highlighter className="h-3.5 w-3.5" />}
          title="文字背景色（先選取一段文字再選色）"
          presetColors={BACK_PRESET_COLORS}
          onPick={applyBackColor}
        />

        <Separator />

        <ToolbarButton title="靠左對齊" onClick={() => exec('justifyLeft')}>
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="置中對齊" onClick={() => exec('justifyCenter')}>
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="靠右對齊" onClick={() => exec('justifyRight')}>
          <AlignRight className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="兩端對齊" onClick={() => exec('justifyFull')}>
          <AlignJustify className="h-3.5 w-3.5" />
        </ToolbarButton>

        <Separator />

        <ToolbarButton title="項目符號清單" onClick={() => exec('insertUnorderedList')}>
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="編號清單" onClick={() => exec('insertOrderedList')}>
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="插入連結（顯示文字 + 網址）" onClick={openLinkDialog}>
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <IconInserter onPick={insertMaterialIcon} />

        <div className="ml-auto" />
        <ToolbarButton title="清除格式（含字級 / 色彩 / 對齊）" onClick={stripFormatting}>
          <Eraser className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>

      <LinkDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        defaultText={getSavedSelectionText(savedRangeRef.current)}
        onSubmit={(url, text) => {
          applyLink(url, text);
          setLinkDialogOpen(false);
        }}
      />
      <CustomFontSizeDialog
        open={customFontSizeDialogOpen}
        onOpenChange={setCustomFontSizeDialogOpen}
        defaultValue={getCurrentFontSize(ref.current)}
        onSubmit={(px) => {
          applyFontSize(px);
          setCustomFontSizeDialogOpen(false);
        }}
      />
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        onInput={() => {
          if (!isComposing.current) emit();
        }}
        onCompositionStart={() => {
          isComposing.current = true;
        }}
        onCompositionEnd={() => {
          isComposing.current = false;
          emit();
        }}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
        }}
        onBlur={emit}
        data-placeholder={placeholder}
        className={cn(
          'prose prose-sm max-w-none px-3 py-2 text-sm leading-7 focus:outline-none',
          '[&_strong]:font-semibold [&_a]:text-primary [&_a]:underline',
          // v0.7.4.3：list padding 從 pl-5（20px）對齊 inlineCopyHtml 的 24px，
          // 三端（RTE / 編輯模式 / 預覽）對 <ol>/<ul> 的縮排視覺收斂為一致
          '[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6',
          '[&_ul]:my-2 [&_ol]:my-2 [&_li]:my-1 [&_p]:my-1.5',
          // v0.7.2.1 placeholder hint 機制：
          //   1. 內容 :empty 且非 focus 狀態才顯示 hint（使用者點進去 focus 後立刻消失，
          //      符合「滑鼠點上去字就消失」的體驗訴求）
          //   2. 用 ::before 不參與 selection，因此 caret 自然停在編輯器最前端
          //   3. pointer-events:none 避免 hint 攔截滑鼠點擊
          '[&:empty:not(:focus)]:before:text-muted-foreground/60',
          '[&:empty:not(:focus)]:before:content-[attr(data-placeholder)]',
          '[&:empty]:before:pointer-events-none',
        )}
        style={{ minHeight }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar 子元件
// ---------------------------------------------------------------------------

function ToolbarButton({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {children}
    </button>
  );
}

function Separator(): React.JSX.Element {
  return <div className="mx-0.5 h-5 w-px bg-border" aria-hidden />;
}

/**
 * v0.7.4.1 → v0.7.4.2：高內容量 Popover（FontFamily / FontSize / Icon picker）共用樣式 + props。
 *
 * # 為什麼 v0.7.4.2 重做
 *
 * v0.7.4.1 用 `max-h-[min(384px,55vh)]` 做容器上限，但這個值是**靜態**的 ——
 * 當 trigger 在 viewport 中下方且上方空間不夠時，Radix avoidCollisions 雖然會把 popover
 * 翻到 bottom，**但不會自動縮短 max-h**，最終 popover 會在 viewport 下緣切掉一截，
 * 使用者看不到「下面還有」也滾不到（因為內容沒有真的觸頂、scroll height = visible height）。
 *
 * v0.7.4.2 改用 Radix 提供的 **`--radix-popover-content-available-height`** CSS 變數 ——
 * 這個變數會根據 viewport / collision boundary 自動算出「popover 在當前位置可用的最大高度」，
 * 不管 popover 翻在 top 還是 bottom 都會給出剛好的值。再用 `min(384px, var(...))` 把上限
 * 卡在 384px 避免 popover 撐滿整個 viewport，得到「永遠不溢出 + 內容真超量會 scroll」的 UX。
 *
 * # POPOVER_AVAILABLE_MAX_H_STYLE
 *
 * 用 inline `style` 而不是 className，因為 Tailwind v3 對 CSS variable + min() 的支持不完美
 * （JIT 對 `[max-height:min(384px,_var(--radix-...))]` 這種有時會 mis-parse 成 fallback）。
 * 直接用 inline style 100% 穩。
 */
const POPOVER_AVAILABLE_MAX_H_STYLE: React.CSSProperties = {
  maxHeight: 'min(384px, var(--radix-popover-content-available-height, 384px))',
};

/**
 * 自訂明顯 scrollbar（webkit + Firefox 雙路），讓 dark theme 下也看得到「可以滾」。
 * 配合 POPOVER_AVAILABLE_MAX_H_STYLE 一起用，內容真超量時才會出現。
 */
const POPOVER_SCROLL_CN = cn(
  'overflow-y-auto',
  '[scrollbar-width:thin]',
  '[scrollbar-color:hsl(var(--muted-foreground)/0.4)_transparent]',
  '[&::-webkit-scrollbar]:w-2',
  '[&::-webkit-scrollbar-track]:bg-transparent',
  '[&::-webkit-scrollbar-thumb]:rounded-full',
  '[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40',
  '[&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/70',
);

/**
 * v0.7.4.2：高內容量 Popover 共用 props（合併 v0.7.4.1 的位置控制 + onOpenAutoFocus prevent）。
 *
 * - `side="top"`：優先往上開（toolbar 通常在編輯區上方）。Radix avoidCollisions 自動處理翻轉。
 * - `sideOffset={6}` / `collisionPadding={12}`：邊界 buffer 與位置間距。
 * - `onOpenAutoFocus={(e) => e.preventDefault()}`：**v0.7.4.2 關鍵新增**。
 *   Radix Popover 預設開啟時會把 focus 拉進 popover content（為了 a11y），
 *   但這會清掉 contentEditable 的 selection visible state。雖然 savedRangeRef 仍保留 range，
 *   但配合 prevent autoFocus 後 selection **視覺上不會消失**，使用者看到「我選的字仍 highlighted」，
 *   操作體驗信心大幅提升（看到自己選的字還在，才會放心點 picker 內的選項）。
 */
const HIGH_CONTENT_POPOVER_PROPS = {
  side: 'top' as const,
  align: 'start' as const,
  sideOffset: 6,
  collisionPadding: 12,
  onOpenAutoFocus: (e: Event) => e.preventDefault(),
};

/**
 * 常用字級預設值（v0.7.4.1 → v0.7.4.5 改用作 dropdown list 的 option 集合）。
 *
 * 涵蓋 EDM 常用範圍：說明文 10-12 / 內文 14-16 / 段標 18-22 / 主標 24-32 / 海報巨字 36-72。
 * v0.7.4.5：直接以**清單形式列在 popover 內**（每個一列、可 scroll），不再用 datalist hint
 * （datalist 在 Chromium / Electron 上 affordance 太弱、使用者看不出來「能下拉」）。
 */
/**
 * v0.7.4.8：依使用者指定的清單擴充至 37 個（10~20 連續、22~60 雙數、70~120 十進位）。
 * 第一項放「自訂」入口（key 為 -1，視覺顯示「自訂…」），點下後開 CustomFontSizeDialog
 * 讓使用者輸入任意 px（1~999，可低於 10、可高於 120 例如 6 / 33 / 133 / 200 等）。
 *
 * `FONT_SIZE_PRESETS_NUMERIC` 是純數字陣列（給 listbox 渲染用）；`-1` 是 dialog 入口的特殊值。
 */
const FONT_SIZE_PRESETS_NUMERIC: number[] = [
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  22, 24, 26, 28, 30, 32, 34, 36, 38, 40,
  42, 44, 46, 48, 50, 52, 54, 56, 58, 60,
  70, 80, 90, 100, 110, 120,
];

/** 「自訂」入口的特殊 key，listbox 用 -1 識別「點下去開 dialog」 */
const FONT_SIZE_CUSTOM_KEY = -1 as const;

/** 沒選取任何文字時 trigger 上的 fallback 顯示字級。 */
const FONT_SIZE_INPUT_DEFAULT = 14;

/** 字級允許範圍（v0.7.4.8 從 8-120 放寬到 1-999，配合「自訂」可任意輸入）。 */
const FONT_SIZE_MIN = 1;
const FONT_SIZE_MAX = 999;

/**
 * 字級下拉式選單（v0.7.4.5 重構為 Word 風）。
 *
 * # 為什麼又改？v0.7.4.2 → v0.7.4.5 的重要轉變
 *
 * v0.7.4.2 採極簡設計：toolbar 是 `[T▾]` icon 按鈕、所有功能（input + 步進按鈕 + datalist）
 * 全塞 popover 內。但使用者實測截圖反應：
 *
 *   1. **「沒下拉式選單」**：datalist 在 Chromium / Electron 上 hint 不夠明顯，使用者完全看
 *      不出來「這個 input 能打開預設值清單」 ──「**先打字才會出現建議**」這個 UX 違反 Word 直覺。
 *   2. **「打字無反應」**：根因是 PopoverContent 自身有 `onMouseDown preventDefault`（保 selection
 *      用），這條 default prevent **連同 input 的 native focus default 行為一起被擋掉** ──
 *      使用者點 input 根本進不了編輯模式（與 ColorPicker 「更多色彩…」是同一族 bug）。
 *   3. **「步進按鈕沒反應」**：步進按鈕塞 popover 內，使用者必須**先打開 popover** 才能點，但他
 *      期望 toolbar 上**直接一鍵 step**（這才是 Word）。
 *
 * # v0.7.4.5 設計（嚴格仿 Word toolbar）
 *
 * **toolbar 三件並排**（不再單一 `[T▾]` 按鈕）：
 *
 *   ```
 *   [字級下拉 12▾]   [字體加大 A↑]   [字體縮小 A↓]
 *   ```
 *
 * - `FontSizeDropdown`：本元件。trigger 顯示**當前字級數字**（例如 `12`）+ chevron，點開
 *   popover 含「自訂輸入欄」+「12 個常用字級 list」(scroll 可看)。
 * - 字體加大 / 字體縮小：直接放在 toolbar 上是普通 ToolbarButton（無 popover），onClick →
 *   `stepFontSize(+2)` / `stepFontSize(-2)`。**一鍵 step 不用打開任何 popover**。
 *
 * popover 內 `input` 加 `onMouseDown / onClick stopPropagation` 阻止冒泡到 PopoverContent
 * 那層的 `preventDefault`，讓 input native focus default 行為正常觸發 → 打字終於 work 了。
 */
/**
 * v0.7.4.8：listbox 第一項放「自訂…」入口；其餘 37 個 px 預設值依使用者指定清單擴充
 * （10~20 連續、22~60 雙數、70~120 十進位）。
 *
 * 點「自訂…」→ 透過 onCustom callback 通知父元件開啟 CustomFontSizeDialog；其餘按鈕
 * 直接 onPick(px) + setOpen(false)。
 *
 * # v0.7.4.7 雙捲軸修復仍保留
 *
 * <ul> 不再有自己的 max-h / overflow-y；單層捲動完全由 PopoverContent 的
 * POPOVER_SCROLL_CN + POPOVER_AVAILABLE_MAX_H_STYLE 負責。
 */
function FontSizeDropdown({
  onPick,
  onCustom,
  getCurrent,
}: {
  onPick: (px: number) => void;
  onCustom: () => void;
  getCurrent: () => number;
}): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const [displayed, setDisplayed] = React.useState<number>(FONT_SIZE_INPUT_DEFAULT);

  React.useEffect(() => {
    if (open) setDisplayed(getCurrent());
  }, [open, getCurrent]);

  const syncDisplayed = () => setDisplayed(getCurrent());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="字級（先選取一段文字）"
          onMouseDown={(e) => {
            e.preventDefault();
            syncDisplayed();
          }}
          className="flex h-7 min-w-[58px] items-center justify-between gap-1 rounded border border-border/60 bg-background px-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
          aria-label="字級下拉式選單"
        >
          <span className="font-mono tabular-nums">{displayed}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        {...HIGH_CONTENT_POPOVER_PROPS}
        className={cn('w-36 p-1', POPOVER_SCROLL_CN)}
        style={POPOVER_AVAILABLE_MAX_H_STYLE}
      >
        <ul role="listbox" className="py-0.5">
          {/* v0.7.4.8：「自訂…」入口（list 第一項）；點下去開 CustomFontSizeDialog */}
          <li key={FONT_SIZE_CUSTOM_KEY}>
            <button
              type="button"
              role="option"
              aria-selected={!FONT_SIZE_PRESETS_NUMERIC.includes(displayed)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                onCustom();
              }}
              className={cn(
                'flex w-full items-center justify-start rounded px-3 py-1 text-sm hover:bg-secondary hover:text-foreground',
                !FONT_SIZE_PRESETS_NUMERIC.includes(displayed)
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              <span className="font-medium">自訂…</span>
              {!FONT_SIZE_PRESETS_NUMERIC.includes(displayed) && (
                <span className="ml-auto font-mono text-xs tabular-nums opacity-70">
                  {displayed}
                </span>
              )}
            </button>
          </li>
          {/* 分隔線 */}
          <li role="separator" aria-hidden className="my-0.5 border-t border-border/60" />
          {FONT_SIZE_PRESETS_NUMERIC.map((px) => (
            <li key={px}>
              <button
                type="button"
                role="option"
                aria-selected={displayed === px}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(px);
                  setDisplayed(px);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-start rounded px-3 py-1 text-sm font-mono tabular-nums hover:bg-secondary hover:text-foreground',
                  displayed === px
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {px}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

const FONT_CATEGORY_LABEL: Record<FontCategory, string> = {
  'sans-tc': '中文 黑體',
  'serif-tc': '中文 宋體',
  'sans-en': '英文 Sans',
  'serif-en': '英文 Serif',
  decorative: '裝飾 / 手寫',
  mono: '等寬',
  emoji: 'Emoji',
  icon: 'Icon 字型',
};

const FONT_CATEGORY_ORDER: FontCategory[] = [
  'sans-tc',
  'serif-tc',
  'sans-en',
  'serif-en',
  'decorative',
  'mono',
  'emoji',
  'icon',
];

/**
 * 字型 picker（v0.7.2 新增）。
 *
 * UI 設計：
 *   - 工具列按鈕：CaseSensitive icon（與字級的 Type icon 區隔）+ 下拉箭頭
 *   - Popover：依 category 分組顯示，每個項目以該字型實際樣式預覽 sampleText
 *   - 點擊項目 → onPick(font) → 套用 inline style 並 ensureFontsLoaded
 *
 * 注意：必須先選取一段文字再選字型；未選取會 no-op（與 ColorPicker 行為一致）。
 */
function FontFamilyPicker({ onPick }: { onPick: (font: FontDef) => void }): React.JSX.Element {
  const [open, setOpen] = React.useState(false);

  // 依 category 分組（一次計算，order 固定）
  const grouped = React.useMemo(() => {
    return FONT_CATEGORY_ORDER.map((cat) => ({
      category: cat,
      label: FONT_CATEGORY_LABEL[cat],
      fonts: FONT_REGISTRY.filter((f) => f.category === cat),
    })).filter((g) => g.fonts.length > 0);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="字型（先選取一段文字再選字型）"
          onMouseDown={(e) => e.preventDefault()}
          className="flex items-center gap-0.5 rounded px-1.5 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <CaseSensitive className="h-3.5 w-3.5" />
          <ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      {/*
       * v0.7.4.6：拿掉 PopoverContent 的 onMouseDown preventDefault。
       * 該 prevent 在 Chromium / Electron 上會破壞瀏覽器為 wheel 事件建立 active scroll target
       * 的內部路由，導致滑鼠滾輪在 popover 上失效。
       * Selection 保護由每個內部 <button> 自己的 onMouseDown preventDefault 守住（已存在）。
       */}
      <PopoverContent
        {...HIGH_CONTENT_POPOVER_PROPS}
        className={cn('w-72 p-1', POPOVER_SCROLL_CN)}
        style={POPOVER_AVAILABLE_MAX_H_STYLE}
      >
        <div className="mb-1 px-2 py-1 text-[10px] text-muted-foreground">
          先選取一段文字再點選字型；非預載字型會自動下載 Google Fonts。
        </div>
        {grouped.map((group, gi) => (
          <div key={group.category} className={gi > 0 ? 'mt-1.5 border-t border-border/60 pt-1.5' : ''}>
            <div className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </div>
            {group.fonts.map((font) => (
              <button
                key={font.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(font);
                  setOpen(false);
                }}
                className="flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left hover:bg-secondary"
              >
                <span className="text-[10px] text-muted-foreground">{font.name}</span>
                <span
                  className="text-sm leading-tight"
                  style={{ fontFamily: font.cssFamily }}
                >
                  {font.sampleText ?? font.name}
                </span>
              </button>
            ))}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Material Symbols icon 插入器（v0.7.2 新增）。
 *
 * 點擊任一 icon → 呼叫 onPick(icon) → RichTextEditor 在 caret 位置插入
 * `<span style="font-family:'Material Symbols Outlined';font-size:20px">name</span>`，
 * 字型 ligature 自動把 ligature 名稱（home / star / favorite ...）變成對應 icon。
 *
 * 與 FontFamilyPicker 不同，這裡**不需要先選取文字**，是「插入」型操作。
 */
function IconInserter({ onPick }: { onPick: (icon: MaterialIconDef) => void }): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const grouped = React.useMemo(() => {
    return MATERIAL_ICON_CATEGORY_ORDER.map((cat) => ({
      category: cat,
      label: MATERIAL_ICON_CATEGORY_LABEL[cat],
      icons: MATERIAL_ICONS.filter((i) => i.category === cat),
    })).filter((g) => g.icons.length > 0);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="插入 Material Symbols icon"
          onMouseDown={(e) => e.preventDefault()}
          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Sticker className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      {/*
       * v0.7.4.6：兩個改善
       *   (1) 拿掉 PopoverContent 的 onMouseDown preventDefault 修滑鼠滾輪失效（同 FontFamilyPicker）
       *   (2) 移除原本標題下方的開發者導向 ligature 說明 hint（使用者反饋多餘）
       */}
      <PopoverContent
        {...HIGH_CONTENT_POPOVER_PROPS}
        className={cn('w-72 p-1.5', POPOVER_SCROLL_CN)}
        style={POPOVER_AVAILABLE_MAX_H_STYLE}
      >
        {grouped.map((group, gi) => (
          <div key={group.category} className={gi > 0 ? 'mt-1.5 border-t border-border/60 pt-1.5' : ''}>
            <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </div>
            <div className="grid grid-cols-6 gap-0.5">
              {group.icons.map((icon) => (
                <button
                  key={icon.name}
                  type="button"
                  title={`${icon.label}（${icon.name}）`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(icon);
                    setOpen(false);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded text-lg text-foreground hover:bg-secondary"
                  style={{ fontFamily: '"Material Symbols Outlined"' }}
                >
                  {icon.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

const FORE_PRESET_COLORS = [
  '#000000', '#374151', '#6B7280', '#9CA3AF',
  '#DC2626', '#EA580C', '#D97706', '#16A34A',
  '#2563EB', '#7C3AED', '#DB2777', '#FFFFFF',
];

const BACK_PRESET_COLORS = [
  'transparent', '#FEF3C7', '#FED7AA', '#FECACA',
  '#FBCFE8', '#DDD6FE', '#BFDBFE', '#A7F3D0',
  '#FDE68A', '#E5E7EB', '#FFE4B5', '#FFFF00',
];

/**
 * 顏色 picker（v0.7.4.7 從 native input 切換到 react-colorful）。
 *
 * # 為什麼又改？v0.7.4.2 / v0.7.4.4 / v0.7.4.6 → v0.7.4.7 的轉折
 *
 * v0.7.4.2 用透明 native color input 想接系統 OS 色盤；v0.7.4.4 修了「PopoverContent
 * 上的 mousedown preventDefault 連帶擋掉 native click default」這個 bug；v0.7.4.6 再次
 * 拿掉 PopoverContent 上的 preventDefault（為了修滑鼠滾輪失效）。但使用者實測仍回報：
 * **「更多色彩…」點下去毫無反應，無法挑選色彩**。
 *
 * 推測根因：在 Electron / Chromium 的某些版本 / 設定下，native color input 開系統色盤的
 * 行為**不可靠**（可能與 BrowserWindow 的 `nativeWindowOpen` / `webPreferences` / 是否在
 * 沙箱中有關），跨平台一致性差。
 *
 * # v0.7.4.7 解法 — 改用 react-colorful（純 React、無 native 依賴）
 *
 * react-colorful 是一個輕量純 React 的視覺色盤元件（< 3KB），用 pointer events 自行實作
 * 飽和度方塊 + 色相條，**完全不依賴 native default 行為**，跨平台 100% 一致。
 *
 * ## UX 設計（仍保住「無套用按鈕」精神）
 *
 * - 常用色 swatch 12 格不變（4×3 grid，點擊直接 onPick + 關 popover）
 * - 「更多色彩…」按鈕點下去 toggle 一個 inline 的 `HexColorPicker` 視覺色盤
 * - **使用者拖曳色盤時即時 onPick**：所選文字字色 / 背景色當下就變（所見即所得）
 * - 旁邊小 swatch + hex 字串 read-only 顯示當前進階色（給使用者參考用，不能編輯）
 * - 「完成」按鈕只是明確收起 popover，不是「套用」按鈕（套用早就在拖曳時即時發生）
 * - popover 關閉時 advancedOpen 自動 reset 回 false
 */
function ColorPicker({
  icon,
  title,
  presetColors,
  onPick,
}: {
  icon: React.ReactNode;
  title: string;
  presetColors: string[];
  onPick: (color: string) => void;
}): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [advancedColor, setAdvancedColor] = React.useState<string>('#000000');

  // popover 收起時順便 reset 進階區，下次開啟時回到「常用色 + 更多色彩…」基本狀態
  React.useEffect(() => {
    if (!open) setAdvancedOpen(false);
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={title}
          onMouseDown={(e) => e.preventDefault()}
          className="flex items-center gap-0.5 rounded px-1.5 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {icon}
          <ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        {...HIGH_CONTENT_POPOVER_PROPS}
        className={cn('w-56 p-2', POPOVER_SCROLL_CN)}
        style={POPOVER_AVAILABLE_MAX_H_STYLE}
      >
        <div className="mb-1.5 text-[10px] font-semibold text-muted-foreground">常用顏色</div>
        <div className="grid grid-cols-6 gap-1">
          {presetColors.map((c) => (
            <button
              key={c}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(c);
                setOpen(false);
              }}
              title={c}
              className="h-7 w-7 rounded border border-border/60 transition-transform hover:scale-110"
              style={{
                background:
                  c === 'transparent'
                    ? 'repeating-linear-gradient(45deg,#fff,#fff 3px,#ddd 3px,#ddd 6px)'
                    : c,
              }}
              aria-label={`選顏色 ${c}`}
            />
          ))}
        </div>

        <div className="mt-2 border-t border-border/60 pt-2">
          {!advancedOpen ? (
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setAdvancedOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded border border-dashed border-border/80 px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="展開進階色盤"
            >
              <Palette className="h-3.5 w-3.5" />
              <span>更多色彩…</span>
            </button>
          ) : (
            <div className="space-y-1.5">
              {/*
               * v0.7.4.7：onChange 只更新 advancedColor preview，不即時 onPick。
               *
               * 如果 onChange 就 onPick → applyForeColor → restoreSelection() →
               * editor.focus() → Radix 偵測到焦點離開 PopoverContent → 自動關閉 popover。
               * 「拖一下就關掉」是這個焦點競搶造成的，不是 HexColorPicker 本身的問題。
               *
               * 解法：拖曳 / 點擊期間只更新色盤下方的預覽色塊 + hex 字串；
               * 使用者按「套用」才 onPick(advancedColor) + 關閉 popover。
               */}
              <HexColorPicker
                color={advancedColor}
                onChange={(c) => setAdvancedColor(c)}
                style={{ width: '100%', height: 130 }}
              />
              <div className="flex items-center gap-1.5 text-xs">
                <div
                  className="h-5 w-5 shrink-0 rounded border border-border/60"
                  style={{ background: advancedColor }}
                  aria-hidden
                />
                <span className="font-mono text-muted-foreground">
                  {advancedColor.toUpperCase()}
                </span>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(advancedColor);
                    setOpen(false);
                  }}
                  className="ml-auto rounded bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground hover:opacity-90"
                  title="套用此顏色並關閉"
                >
                  套用
                </button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * 從 savedRangeRef 抓出 selection 的文字內容（v0.7.4.2，給 LinkDialog 預填用）。
 * 沒 range / range 沒文字 → 回空字串。
 */
function getSavedSelectionText(range: Range | null): string {
  if (!range) return '';
  try {
    return range.toString();
  } catch {
    return '';
  }
}

/**
 * 「插入連結」對話框（v0.7.4.2）。
 *
 * # 為什麼換掉 window.prompt
 *
 * 使用者反饋：「『插入連結』按下去之後，應該要能輸入「顯示文字」與「網址」。」
 * `window.prompt` 只能單行輸入、無 label、無預填、看起來很「上世紀」，且對 contentEditable
 * 的 selection 也有干擾（在某些瀏覽器 prompt 開起來會清掉 selection）。
 *
 * 改用 shadcn Dialog 處理：兩個欄位（顯示文字 + 網址）+ 確認 / 取消。
 *
 * # defaultText 自動預填
 *
 * 使用者通常先選一段文字、再按連結按鈕（想把這段文字變成 anchor）。
 * 開啟 dialog 時把已選的文字塞進「顯示文字」欄位 → 大多數情境直接按確認就 OK，
 * 不用再打一次顯示文字。如果使用者想改用其他文字當 anchor 顯示，直接編輯欄位即可。
 *
 * # url normalize 邏輯放在父層 applyLink
 *
 * Dialog 純 UI，不做業務邏輯。url trim、null 檢查、createLink vs insertHTML 分支，
 * 全交由 RichTextEditor 的 applyLink 處理。Dialog 只負責收集兩個字串然後 onSubmit。
 */
/**
 * 自訂字級 dialog（v0.7.4.8 新增）。
 *
 * # 為什麼要 dialog（而非 popover 內 inline input）
 *
 * v0.7.4.5 / 4.6 / 4.7 連續嘗試在 popover 內塞 number input 都失敗：
 *   - v0.7.4.5：input 焦點被 PopoverContent 的 mousedown preventDefault 擋掉
 *   - v0.7.4.7：使用者反饋「操作不直覺」（截圖紅叉）— 雙捲軸 + input 視覺干擾
 *
 * 改用獨立 Dialog 後：
 *   - 焦點完全屬於 Dialog（不與 contentEditable 競爭）
 *   - 視覺上明確「這是一個 modal，請輸入數字、按確定」
 *   - 接受 1~999 px 任意值（含使用者舉例的 6 / 33 / 133）
 *   - autoFocus + Enter 確認 + 取消按鈕，與 LinkDialog 結構一致
 *
 * onSubmit 回 callback 後由父元件決定要不要 restoreSelection + applyFontSize。
 */
function CustomFontSizeDialog({
  open,
  onOpenChange,
  defaultValue,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  defaultValue: number;
  onSubmit: (px: number) => void;
}): React.JSX.Element {
  const [value, setValue] = React.useState(String(defaultValue));
  const [error, setError] = React.useState<string | null>(null);

  // 開啟時用當前字級預填，關閉時不重置（避免下次開先閃出舊值再被新預填）
  React.useEffect(() => {
    if (open) {
      setValue(String(defaultValue));
      setError(null);
    }
  }, [open, defaultValue]);

  const submit = () => {
    const n = parseFloat(value);
    if (!Number.isFinite(n) || n <= 0) {
      setError('請輸入有效的正數，例如 13、33、200');
      return;
    }
    if (n < FONT_SIZE_MIN || n > FONT_SIZE_MAX) {
      setError(`允許範圍 ${FONT_SIZE_MIN}–${FONT_SIZE_MAX} px`);
      return;
    }
    onSubmit(Math.round(n));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>自訂字級</DialogTitle>
          <DialogDescription>
            輸入任意 px 值（{FONT_SIZE_MIN}–{FONT_SIZE_MAX}）。例如 6、13、33、133、200 都可以。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-foreground">字級（px）</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={FONT_SIZE_MIN}
                max={FONT_SIZE_MAX}
                step={1}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submit();
                  }
                }}
                autoFocus
                className="h-9 flex-1 rounded border border-border bg-background px-2 text-sm font-mono text-foreground"
                aria-label="自訂字級 px 值"
              />
              <span className="text-sm text-muted-foreground">px</span>
            </div>
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded border border-border px-3 py-1.5 text-sm hover:bg-secondary"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
          >
            確定
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkDialog({
  open,
  onOpenChange,
  defaultText,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  defaultText: string;
  onSubmit: (url: string, displayText: string) => void;
}): React.JSX.Element {
  const [url, setUrl] = React.useState('');
  const [text, setText] = React.useState('');

  // 開啟時預填，關閉時清空（避免下次開還殘留上次的值）
  React.useEffect(() => {
    if (open) {
      setUrl('');
      setText(defaultText);
    }
  }, [open, defaultText]);

  const submit = () => {
    if (!url.trim()) return;
    onSubmit(url, text);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>插入連結</DialogTitle>
          <DialogDescription>
            「顯示文字」留空 → 連結文字就用網址本身；如果先選了一段文字，會自動填入這欄。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-foreground">
              顯示文字（可選填）
            </span>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="例：點此報名"
              className="h-9 w-full rounded border border-border bg-background px-2 text-sm text-foreground"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-foreground">
              網址<span className="text-destructive"> *</span>
            </span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="https://example.com"
              autoFocus
              className="h-9 w-full rounded border border-border bg-background px-2 text-sm text-foreground"
            />
          </label>
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded border border-border px-3 py-1.5 text-sm hover:bg-secondary"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!url.trim()}
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            插入連結
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 把選取文字包成 `<span style="<prop>:<value>">`。
 *
 * 設計重點：
 *  - 永遠是 span，可同時帶多個 inline style（這裡每次只設一個 prop，但結構支持擴充）
 *  - 跨節點選取時 fallback 到 `extractContents() + insertNode()`，**保留內部 inline style**
 *
 * # 跨節點選取 fallback 設計（v0.7.4.1 修正）
 *
 * `range.surroundContents()` 在「選取範圍跨多個 element 部分重疊」時會丟 `InvalidStateError`
 * （例如選了 `<span style="color:red">a</span><span style="color:blue">b</span>` 中間到中間）。
 * 舊版 catch 用 `escapeHtml(sel.toString())` 把選取轉純文字 →
 * **內部 inline style（色彩 / 字型 / 背景色）通通被抹掉**。
 *
 * 新 fallback 用 `extractContents()`：取出選取範圍的 DocumentFragment（保留所有 element 結構），
 * 包進新 span 後 `insertNode` 回原位置。內部任何已套的 `<span style="color:..">` /
 * `<span style="font-family:..">` 結構都完整保留，只是**外層多套一層** font-size 之類的 prop。
 *
 * 這正是使用者期待的行為：「我先選色、再改字級」應該得到雙重屬性，而不是色彩被抹。
 */
function wrapInlineSpanStyle(
  prop: 'font-family' | 'font-size',
  value: string,
  root: HTMLDivElement | null,
  emit: () => void,
): void {
  if (!root) return;
  root.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.toString().length === 0) return;
  const range = sel.getRangeAt(0);
  const span = document.createElement('span');
  span.setAttribute('style', `${prop}:${value}`);
  try {
    range.surroundContents(span);
    // 把 caret 放到 span 之後，避免使用者繼續輸入仍套到舊 span 內
    placeCaretAfter(span, sel);
    emit();
  } catch {
    // surroundContents 在跨節點 partial 選取會丟 InvalidStateError；
    // 改用 extract + insert，保留內部 element 結構
    try {
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
      placeCaretAfter(span, sel);
      emit();
    } catch {
      // 真的不行才 fallback 到純文字（這條路應該幾乎不會走到）
      const escapedValue = escapeAttr(value);
      const html = `<span style="${prop}:${escapedValue}">${escapeHtml(sel.toString())}</span>`;
      document.execCommand('insertHTML', false, html);
      emit();
    }
  }
}

/**
 * 把 caret（折疊的 selection）放到指定 element 之後，避免「套完樣式繼續輸入時樣式持續延伸」。
 * 從 v0.7.4.1 開始，wrapInlineSpanStyle 套完都呼叫一次。
 */
function placeCaretAfter(node: Node, sel: Selection): void {
  try {
    const r = document.createRange();
    r.setStartAfter(node);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  } catch {
    /* selection API 偶爾失敗 → 忽略，不影響 emit */
  }
}

/**
 * 偵測當前 selection 起始 element 的 computed font-size px 值（v0.7.4.1）。
 *
 * 用途：FontSize toolbar 的「再大一點 / 再小一點」步進按鈕需要「當前字級」做基準。
 * 沒選取或 selection API 失敗 → 回傳 14（與舊版預設一致），確保步進永遠有合理起點。
 *
 * 為什麼用 computed style 而不是 inline style：
 *   - 使用者可能還沒套過字級 → inline style 為空但 CSS 繼承自 prose container
 *   - computed style 永遠回傳實際渲染的 px 值（例如 prose-sm 預設是 14px）
 */
function getCurrentFontSize(root: HTMLElement | null): number {
  if (!root) return 14;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 14;
  const range = sel.getRangeAt(0);
  let node: Node | null = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  if (!(node instanceof Element)) return 14;
  // 確認還在 root 內，否則回傳預設（避免 selection 跑出 editor）
  if (!root.contains(node)) return 14;
  const cs = window.getComputedStyle(node);
  const px = parseFloat(cs.fontSize);
  return Number.isFinite(px) ? Math.round(px) : 14;
}

/** HTML attribute 安全 escape（避免值含 " 破壞 attribute） */
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// 註：HTML 清理（sanitizeOutgoing / sanitizeStyle / FONT_SIZE_MAP）已於 v0.7.4 拆到
//     `src/lib/editor/sanitize.ts`，理由：
//     - 同檔同時 export 元件 + utility function 違反 React Fast Refresh 契約，
//       導致每次改本檔都 full reload。拆出後本檔純 export `RichTextEditor` 元件，
//       Fast Refresh 100% 工作，編輯體驗大幅改善。
//     - 兩端使用者（本檔的 `emit`、`EditableCanvas` 的 placeholder 判定）都改 import
//       `@/lib/editor/sanitize`，行為與簽章不變。
// ---------------------------------------------------------------------------
