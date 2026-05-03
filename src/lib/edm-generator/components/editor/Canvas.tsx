import * as React from 'react';
import { useEdmStore } from '@edm/store/edmStore';
import { useUiStore } from '@edm/store/uiStore';
import { renderEdmHtml } from '@edm/lib/email/render';
import { Loader2, Smartphone, Monitor, Maximize2, Keyboard } from 'lucide-react';
import { Button } from '@edm/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@edm/components/ui/tooltip';
import { EditableCanvas } from './EditableCanvas';
import { HeroAdaptBanner } from './HeroAdaptBanner';
import { ShortcutsCheatSheet } from './ShortcutsCheatSheet';
import { useBlockShortcuts } from '@edm/hooks/useBlockShortcuts';
import { cn } from '@edm/lib/utils';

type CanvasMode = 'edit' | 'preview';

export function Canvas(): React.JSX.Element {
  const blocks = useEdmStore((s) => s.blocks);
  const tokens = useEdmStore((s) => s.tokens);
  const typography = useEdmStore((s) => s.typography);
  const templateId = useEdmStore((s) => s.templateId);
  const plan = useEdmStore((s) => s.plan);

  const enterPreviewLayout = useUiStore((s) => s.enterPreviewLayout);
  const exitPreviewLayout = useUiStore((s) => s.exitPreviewLayout);
  const enterFullscreen = useUiStore((s) => s.enterFullscreen);
  const fullscreen = useUiStore((s) => s.fullscreenPreview);

  const [mode, setMode] = React.useState<CanvasMode>('edit');
  const [viewport, setViewport] = React.useState<'desktop' | 'mobile'>('desktop');
  const [html, setHtml] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [cheatSheetOpen, setCheatSheetOpen] = React.useState(false);

  // v0.4.1：把鍵盤快捷鍵掛在 Canvas（覆蓋編輯模式 + 預覽模式）
  useBlockShortcuts({ isCheatSheetOpen: cheatSheetOpen, setCheatSheetOpen });

  // 切換到預覽模式時自動隱藏左右面板，切回編輯時還原
  // 全螢幕模式時永遠保持隱藏（由 UI store 接管）
  React.useEffect(() => {
    if (fullscreen) return;
    if (mode === 'preview') enterPreviewLayout();
    else exitPreviewLayout();
  }, [mode, fullscreen, enterPreviewLayout, exitPreviewLayout]);

  React.useEffect(() => {
    if (mode !== 'preview' && !fullscreen) return;
    let cancelled = false;
    setBusy(true);
    renderEdmHtml({ blocks, tokens, typography, templateId, previewText: plan.title })
      .then((h) => {
        if (!cancelled) setHtml(h);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, fullscreen, blocks, tokens, typography, templateId, plan.title]);

  // 全螢幕時強制使用「預覽」內容
  const effectiveMode: CanvasMode = fullscreen ? 'preview' : mode;
  // 桌面用 720（容納 640 容器 + 留白），手機用 375（iPhone SE/標準寬度，剛好觸發 ≤480 斷點）
  const wrapperWidth = viewport === 'mobile' ? 375 : 720;

  return (
    <div className="flex h-full flex-col">
      {!fullscreen && (
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-card/40 px-4">
          {/* v0.7.0：原本「雙擊文字直接修改…」與「Outlook 相容渲染…」兩段長說明會把
              ModeSwitch 擠成垂直排列；改成 hover「編輯 / 預覽」按鈕時才以 tooltip 顯示。
              busy spinner 移到 ModeSwitch 旁邊，預覽模式 loading 中仍可看到指示。 */}
          <div className="flex items-center gap-2">
            <ModeSwitch mode={mode} setMode={setMode} />
            {busy && mode === 'preview' && (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-label="預覽渲染中" />
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant={viewport === 'desktop' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewport('desktop')}
              title="桌面預覽（Outlook 寬度 640px）"
            >
              <Monitor className="h-3.5 w-3.5" />
              桌面
            </Button>
            <Button
              variant={viewport === 'mobile' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => {
                setViewport('mobile');
                // 編輯模式下不會套用 @media，自動切到預覽才能看見真實手機版排版
                if (mode === 'edit') setMode('preview');
              }}
              title="手機預覽（375px，自動套用響應式排版）"
            >
              <Smartphone className="h-3.5 w-3.5" />
              手機
            </Button>
            <div className="mx-1 h-5 w-px bg-border" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCheatSheetOpen(true)}
              title="鍵盤捷徑（按 ?）"
            >
              <Keyboard className="h-3.5 w-3.5" />
            </Button>
            {mode === 'preview' && (
              <>
                <div className="mx-1 h-5 w-px bg-border" />
                <Button variant="ghost" size="sm" onClick={enterFullscreen} title="全螢幕預覽（F11）">
                  <Maximize2 className="h-3.5 w-3.5" />
                  全螢幕
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <ShortcutsCheatSheet open={cheatSheetOpen} onOpenChange={setCheatSheetOpen} />

      {/* 切模板後若 hero 還是舊模板的 AI 圖 → 提示重生（fullscreen 時隱藏避免擋預覽） */}
      {!fullscreen && <HeroAdaptBanner />}

      <div
        className={cn(
          'flex flex-1 items-start justify-center overflow-auto bg-muted/30',
          fullscreen ? 'p-0' : 'p-6',
        )}
      >
        <div
          id="edm-preview-frame"
          className={cn(
            'overflow-hidden transition-all',
            fullscreen ? '' : 'rounded-lg shadow-2xl ring-1 ring-border',
          )}
          style={{ width: wrapperWidth, background: tokens.bg }}
        >
          {effectiveMode === 'edit' ? (
            <EditableCanvas
              blocks={blocks}
              tokens={tokens}
              typography={typography}
              templateId={templateId}
            />
          ) : (
            <iframe
              title="EDM Preview"
              srcDoc={html}
              className="block w-full"
              style={{ height: fullscreen ? '100vh' : 1200, border: 0, background: tokens.bg }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * v0.7.0：tooltip 內容字體放大到 sm（14px，比預設 xs 12px 易讀），
 * 用 sideOffset 推開避免遮按鈕；單行不換行（max-w 約束 + truncate fallback）。
 * Radix Tooltip 是 hover-driven，使用者只要游標不離開 trigger 就會持續顯示，
 * 自然滿足「不要小於 2 秒」的要求；使用者離開時才關閉。
 */
const TOOLTIP_CONTENT_CLASS = 'max-w-[480px] whitespace-nowrap text-sm leading-relaxed';

function ModeSwitch({
  mode,
  setMode,
}: {
  mode: CanvasMode;
  setMode: (m: CanvasMode) => void;
}): React.JSX.Element {
  return (
    <div className="flex rounded-md border border-border bg-secondary/40 p-0.5 text-xs">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={cn(
              'rounded px-2.5 py-1 transition-colors',
              mode === 'edit' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setMode('edit')}
          >
            編輯
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6} className={TOOLTIP_CONTENT_CLASS}>
          雙擊文字直接修改、拖曳調整順序、雙擊圖片 / 按鈕跳出編輯視窗
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={cn(
              'rounded px-2.5 py-1 transition-colors',
              mode === 'preview' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setMode('preview')}
          >
            預覽
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6} className={TOOLTIP_CONTENT_CLASS}>
          Outlook 相容渲染（與寄出後一致）
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
