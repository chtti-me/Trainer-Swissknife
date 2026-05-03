import * as React from 'react';
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels';
import type { PanelSize } from 'react-resizable-panels';
import { TopToolbar } from './TopToolbar';
import { LeftPanel } from './LeftPanel';
import { RightPanel } from './RightPanel';
import { Canvas } from '@edm/components/editor/Canvas';
import { BlockEditDialog } from '@edm/components/editor/BlockEditDialog';
import { SaveModuleDialog } from '@edm/components/modules/SaveModuleDialog';
import { Toaster } from '@edm/components/ui/toast';
import { TooltipProvider } from '@edm/components/ui/tooltip';
import {
  useUiStore,
  DEFAULT_LEFT_SIZE,
  DEFAULT_RIGHT_SIZE,
  MIN_PANEL_SIZE,
  MAX_PANEL_SIZE,
} from '@edm/store/uiStore';
import { cn } from '@edm/lib/utils';
import { Minimize2, GripVertical } from 'lucide-react';
import { Button } from '@edm/components/ui/button';

/**
 * 在 useEffect 中比較浮點寬度時的容忍誤差（百分比）。
 * react-resizable-panels 內部會做 1e-9 級的浮點修正，
 * 太嚴的比較會造成 effect 反覆觸發 → 無限 resize 迴圈。
 */
const SIZE_EPSILON = 0.5;

// 一次性把 v0.2 之前殘留的 layout 清掉，避免使用者卡在「panel 寬度為 0、無法拖開」的狀態。
// 這段在 AppShell 模組載入時就執行，比所有 React 生命週期都早。
if (typeof window !== 'undefined') {
  try {
    const KEY_PREFIX = 'react-resizable-panels';
    const STALE_KEYS = ['edm-panel-layout-v1', 'edm-shell-v1'];
    for (const k of Object.keys(window.localStorage)) {
      if (STALE_KEYS.some((s) => k.includes(s)) || k.startsWith(KEY_PREFIX)) {
        window.localStorage.removeItem(k);
      }
    }
  } catch {
    // localStorage 不可用就略過
  }
}

export function AppShell(): React.JSX.Element {
  const leftOpen = useUiStore((s) => s.leftPanelOpen);
  const rightOpen = useUiStore((s) => s.rightPanelOpen);
  const leftSize = useUiStore((s) => s.leftPanelSize);
  const rightSize = useUiStore((s) => s.rightPanelSize);
  const setLeftSize = useUiStore((s) => s.setLeftPanelSize);
  const setRightSize = useUiStore((s) => s.setRightPanelSize);
  const fullscreen = useUiStore((s) => s.fullscreenPreview);
  const exitFullscreen = useUiStore((s) => s.exitFullscreen);

  const leftRef = usePanelRef();
  const rightRef = usePanelRef();

  // 開啟 / 關閉左右面板：
  // - 開啟時用 resize() 強制套到記憶大小或預設值，不依賴 expand() 的內建記憶（v4 在 storage 變動下不可靠）
  // - 關閉時 collapse 到 0
  // - resize() 的數值若不加單位會被當 px，所以一律以 `${n}%` 字串傳入
  React.useEffect(() => {
    const ref = leftRef.current;
    if (!ref) return;
    if (leftOpen && !fullscreen) {
      const cur = ref.getSize().asPercentage;
      if (cur < MIN_PANEL_SIZE - SIZE_EPSILON) {
        ref.resize(`${Math.max(MIN_PANEL_SIZE, leftSize)}%`);
      }
    } else {
      ref.collapse();
    }
    // 故意不把 leftSize 加進 deps：避免 onResize 更新 leftSize → 再觸發 effect → 再 resize 的迴圈
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftOpen, fullscreen, leftRef]);

  React.useEffect(() => {
    const ref = rightRef.current;
    if (!ref) return;
    if (rightOpen && !fullscreen) {
      const cur = ref.getSize().asPercentage;
      if (cur < MIN_PANEL_SIZE - SIZE_EPSILON) {
        ref.resize(`${Math.max(MIN_PANEL_SIZE, rightSize)}%`);
      }
    } else {
      ref.collapse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightOpen, fullscreen, rightRef]);

  // Panel onResize 回呼：寫回 store，讓下次重新展開時能還原拖曳大小
  const onLeftResize = React.useCallback(
    (size: PanelSize) => {
      // 只在「展開且大於最小寬度」的情況下記憶；
      // 拖到 0（collapse）或 fullscreen 觸發的縮小不要污染記憶值
      if (size.asPercentage >= MIN_PANEL_SIZE - SIZE_EPSILON) {
        setLeftSize(size.asPercentage);
      }
    },
    [setLeftSize],
  );

  const onRightResize = React.useCallback(
    (size: PanelSize) => {
      if (size.asPercentage >= MIN_PANEL_SIZE - SIZE_EPSILON) {
        setRightSize(size.asPercentage);
      }
    },
    [setRightSize],
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
        {!fullscreen && <TopToolbar />}
        <div className="flex flex-1 overflow-hidden">
          <Group id="edm-shell" orientation="horizontal" className="flex h-full w-full">
            <Panel
              id="left"
              panelRef={leftRef}
              defaultSize={`${DEFAULT_LEFT_SIZE}%`}
              minSize={`${MIN_PANEL_SIZE}%`}
              maxSize={`${MAX_PANEL_SIZE}%`}
              collapsible
              collapsedSize="0%"
              onResize={onLeftResize}
              className="bg-card/40"
            >
              <LeftPanel />
            </Panel>

            <ResizeSeparator id="left-handle" hidden={fullscreen} />

            <Panel id="center" minSize="30%" className="bg-muted/30">
              <Canvas />
            </Panel>

            <ResizeSeparator id="right-handle" hidden={fullscreen} />

            <Panel
              id="right"
              panelRef={rightRef}
              defaultSize={`${DEFAULT_RIGHT_SIZE}%`}
              minSize={`${MIN_PANEL_SIZE}%`}
              maxSize={`${MAX_PANEL_SIZE}%`}
              collapsible
              collapsedSize="0%"
              onResize={onRightResize}
              className="bg-card/40"
            >
              <RightPanel />
            </Panel>
          </Group>
        </div>
      </div>

      {fullscreen && (
        <div className="pointer-events-none fixed left-1/2 top-3 z-[60] -translate-x-1/2">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 bg-background/90 px-3 py-1.5 text-xs shadow-lg backdrop-blur">
            <span className="text-muted-foreground">全螢幕預覽中</span>
            <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              ESC
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={exitFullscreen}
            >
              <Minimize2 className="h-3 w-3" />
              退出
            </Button>
          </div>
        </div>
      )}

      <BlockEditDialog />
      <SaveModuleDialog />
      <Toaster />
    </TooltipProvider>
  );
}

/**
 * 左/中、中/右之間的拖曳分隔線（react-resizable-panels v4 的 Separator）。
 * - 拖曳熱區寬度 6px（夠胖才好抓），視覺上呈現 1.5px 細線
 * - hover 時整條轉成主色強調並露出中央 grip icon
 * - fullscreen 模式直接縮為 0 寬並停用 pointer 事件
 */
function ResizeSeparator({ id, hidden }: { id: string; hidden: boolean }): React.JSX.Element {
  return (
    <Separator
      id={id}
      className={cn(
        // group 用於 hover 時顯示 grip；relative 讓 grip 能 absolute 定位
        'group relative flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-border/40 outline-none transition-colors',
        'hover:bg-primary/60',
        hidden && 'pointer-events-none w-0 opacity-0',
      )}
    >
      <span
        className={cn(
          'pointer-events-none absolute flex h-12 w-3 items-center justify-center rounded-sm border border-border bg-card/95 opacity-0 shadow-sm transition-opacity',
          'group-hover:opacity-100',
        )}
      >
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </span>
    </Separator>
  );
}
