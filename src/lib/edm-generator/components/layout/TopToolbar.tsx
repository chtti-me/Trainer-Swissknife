import * as React from 'react';
import { Button } from '@edm/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@edm/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@edm/components/ui/dialog';
import {
  Undo2,
  Redo2,
  Download,
  Copy,
  ImageDown,
  Settings,
  FileCode,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Maximize2,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { useEdmStore } from '@edm/store/edmStore';
import { useUiStore } from '@edm/store/uiStore';
import {
  exportPng,
  describePngExportError,
  describePngExportPhase,
  PngExportError,
} from '@edm/lib/export/toPng';
import { exportZip, exportHtmlFile } from '@edm/lib/export/toZip';
import { renderEdmHtml } from '@edm/lib/email/render';
import { copyToClipboard, cn } from '@edm/lib/utils';
import { toast, toastLoading } from '@edm/components/ui/toast';
import { SettingsDialog } from '@edm/components/settings/SettingsDialog';
import { APP_VERSION } from '@edm/lib/version';
import { useHostConfigStore } from '@edm/store/hostConfigStore';
import { getSettingsAdapter } from '@edm/lib/settings/registry';
import { getDraftStorageAdapter } from '@edm/lib/draft/registry';
import { AutosaveIndicator } from './AutosaveIndicator';

export function TopToolbar(): React.JSX.Element {
  const { undo, redo, canUndo, canRedo, blocks, tokens, typography, templateId, plan, resetToInitial } = useEdmStore();
  const leftOpen = useUiStore((s) => s.leftPanelOpen);
  const rightOpen = useUiStore((s) => s.rightPanelOpen);
  const toggleLeft = useUiStore((s) => s.toggleLeftPanel);
  const toggleRight = useUiStore((s) => s.toggleRightPanel);
  const enterFullscreen = useUiStore((s) => s.enterFullscreen);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [resetDialogOpen, setResetDialogOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  // v0.5.1：宿主可指定 hideSettingsPanel 完全藏起齒輪按鈕；
  //         同時 SettingsAdapter 自我聲明 supportsApiKeyUI === false 時也自動隱藏，
  //         避免「介面在但根本存不進去」的錯亂體驗。
  const hostConfig = useHostConfigStore((s) => s.config);
  const hideSettingsPanel =
    hostConfig.hideSettingsPanel === true || !getSettingsAdapter().supportsApiKeyUI();
  const poweredByLabel =
    hostConfig.poweredByLabel ?? 'Powered by Gemini · 中華電信學院資訊學系';

  const handleCopyHtml = async () => {
    setBusy('copy');
    try {
      const html = await renderEdmHtml(
        { blocks, tokens, typography, templateId, previewText: plan.title },
        { beautify: true },
      );
      await copyToClipboard(html, true);
      toast({ title: '已複製 HTML 到剪貼簿', description: '已美化縮排，方便貼進編輯器微調', variant: 'success' });
    } catch (err) {
      toast({ title: '複製失敗', description: (err as Error).message, variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadHtml = async () => {
    setBusy('html');
    try {
      const html = await renderEdmHtml(
        { blocks, tokens, typography, templateId, previewText: plan.title },
        { pretty: true, beautify: true },
      );
      const filename = `${plan.classCode || 'EDM'}_${plan.title || 'untitled'}.html`.replace(/[\\/:*?"<>|]/g, '_');

      // v0.5.2：宿主可攔截 HTML 下載（例：直接寫進 DB 而不下載檔）
      let handled = false;
      if (hostConfig.onExportHtml) {
        try {
          handled = (await hostConfig.onExportHtml(html, filename)) === true;
        } catch (e) {
          console.warn('[TopToolbar] onExportHtml hook threw, falling back:', e);
        }
      }
      if (!handled) await exportHtmlFile(html, filename);
      toast({ title: handled ? '已交由宿主處理 HTML' : '已下載 HTML 檔', variant: 'success' });
    } catch (err) {
      toast({ title: '下載失敗', description: (err as Error).message, variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadZip = async () => {
    setBusy('zip');
    try {
      const html = await renderEdmHtml(
        { blocks, tokens, typography, templateId, previewText: plan.title },
        { pretty: true, beautify: true },
      );
      const filename = `${plan.classCode || 'EDM'}_${plan.title || 'untitled'}`.replace(/[\\/:*?"<>|]/g, '_');

      // v0.5.2：宿主可接管 ZIP 處理；接管時直接給 caller blob，不走 exportZip 的預設下載
      if (hostConfig.onExportZip) {
        const { buildZipBlob } = await import('@edm/lib/export/toZip');
        const blob = await buildZipBlob({ html, blocks, baseName: filename });
        let handled = false;
        try {
          handled = (await hostConfig.onExportZip(blob, `${filename}.zip`)) === true;
        } catch (e) {
          console.warn('[TopToolbar] onExportZip hook threw, falling back:', e);
        }
        if (!handled) {
          // hook 沒接管 → 走預設下載（用同一個 blob，不重新打包）
          const { downloadBlob } = await import('@edm/lib/utils');
          downloadBlob(blob, `${filename}.zip`);
        }
        toast({ title: handled ? '已交由宿主處理 ZIP' : '已打包下載 ZIP', description: 'HTML 與外部圖片已分離', variant: 'success' });
      } else {
        await exportZip({ html, blocks, baseName: filename });
        toast({ title: '已打包下載 ZIP', description: 'HTML 與外部圖片已分離', variant: 'success' });
      }
    } catch (err) {
      toast({ title: '打包失敗', description: (err as Error).message, variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  /**
   * v0.7.5.2：重置 EDM —— 把畫布、所有 block、配色、模板、hero 圖、history 全清回初始狀態。
   *
   * 流程：
   *   1) `adapter.clear()`：best-effort 清掉 IndexedDB / Electron 檔案系統的草稿
   *      （即使失敗也不擋住 UI 重置；下一次 autosave 800ms 後會自然覆寫成空 snapshot）
   *   2) `resetToInitial()`：edmStore 同步歸零
   *   3) toast 提示完成
   *
   * 這個操作**不可復原**（history 也清掉了，按 Undo 也回不去）── 所以 caller 必須先彈
   * confirm dialog 讓使用者確認。
   */
  const handleReset = async () => {
    setBusy('reset');
    try {
      try {
        await getDraftStorageAdapter().clear();
      } catch (err) {
        console.warn('[TopToolbar] clear autosave draft failed (non-fatal):', err);
      }
      resetToInitial();
      setResetDialogOpen(false);
      toast({
        title: '已重置 EDM',
        description: '所有編輯已清除，畫布回到初始狀態（此操作不可復原）',
        variant: 'success',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadPng = async () => {
    setBusy('png');
    // v0.4.4：用 loading toast 顯示階段進度，失敗時依錯誤分類顯示中文友善訊息
    const t = toastLoading({ title: '匯出 PNG 中…', description: describePngExportPhase('preparing') });
    try {
      const filename = `${plan.classCode || 'EDM'}_${plan.title || 'untitled'}.png`.replace(/[\\/:*?"<>|]/g, '_');
      await exportPng(
        filename,
        { blocks, tokens, typography, templateId, previewText: plan.title },
        {
          onProgress: (phase) => {
            t.update({ description: describePngExportPhase(phase) });
          },
          // v0.5.2：宿主可攔截 PNG blob（例：上傳到 R2 + 寫 DB）
          onBlob: hostConfig.onExportPng,
        },
      );
      t.success({ title: '已下載 PNG 預覽', description: filename });
    } catch (err) {
      console.error('PNG export failed:', err);
      if (err instanceof PngExportError) {
        const { title, description } = describePngExportError(err.code);
        t.error({ title, description });
      } else {
        t.error({ title: '匯出 PNG 失敗', description: (err as Error).message });
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card/60 px-2">
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleLeft}
              className={cn(!leftOpen && 'text-muted-foreground')}
            >
              {leftOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{leftOpen ? '收合左側面板' : '展開左側面板'}（Ctrl+B）</TooltipContent>
        </Tooltip>
        {/*
         * v0.7.5.1：產品名稱兩行堆疊（中華電信學院 / EDM 產生器），版本號移到 hover tooltip。
         *
         * # 防斷字（whitespace-nowrap）
         * 沒加 nowrap 時若容器被擠窄（例如 AutosaveIndicator 文字較長時），瀏覽器會
         * 在「中華電信學」後直接 break 成「中華電信學/院」這種錯誤斷字。兩個 span 都
         * shrink-0 + nowrap 確保六字 / 五字（含空格）整體永遠單行不斷。
         *
         * # Tooltip 內容
         * 只露 v{APP_VERSION}（純版本號）+ powered by；不再露「階段 E · 使用者體驗深耕」
         * 這類開發團隊內部標籤（使用者看不懂、也不需要知道）。
         */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="mx-2 flex shrink-0 cursor-default items-center gap-2">
              <Mail className="h-5 w-5 shrink-0 text-primary" />
              <span className="flex flex-col text-sm font-semibold leading-tight">
                <span className="whitespace-nowrap">中華電信學院</span>
                <span className="whitespace-nowrap">EDM 產生器</span>
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="font-mono text-xs">v{APP_VERSION}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{poweredByLabel}</div>
          </TooltipContent>
        </Tooltip>
        {/* v0.7.5.1：autosave 狀態指示器（頁面只顯狀態詞 + 色，詳情 hover 顯示） */}
        <AutosaveIndicator />
      </div>

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" disabled={!canUndo()} onClick={undo}>
              <Undo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>復原 (Ctrl+Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" disabled={!canRedo()} onClick={redo}>
              <Redo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>重做 (Ctrl+Y)</TooltipContent>
        </Tooltip>
        {/*
         * v0.7.5.2：重置 EDM 按鈕。放 Undo/Redo 旁邊（同屬「狀態管理」分組），
         * destructive 紅色提示不可復原；點下去會先彈 confirm dialog（避免誤觸）。
         */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={!!busy}
              onClick={() => setResetDialogOpen(true)}
              className="text-muted-foreground hover:text-destructive"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>重置 EDM（清空所有編輯，不可復原）</TooltipContent>
        </Tooltip>
        <div className="mx-2 h-6 w-px bg-border" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={handleCopyHtml} disabled={!!busy}>
              <Copy className="h-4 w-4" />
              <span className="ml-1.5">複製 HTML</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>複製可貼進 Outlook 的 HTML</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={handleDownloadHtml} disabled={!!busy}>
              <FileCode className="h-4 w-4" />
              <span className="ml-1.5">下載 HTML</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>下載 .html 單檔（含 base64 圖片）</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={handleDownloadZip} disabled={!!busy}>
              <Download className="h-4 w-4" />
              <span className="ml-1.5">ZIP</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>HTML + 圖片資料夾打包</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={handleDownloadPng} disabled={!!busy}>
              <ImageDown className="h-4 w-4" />
              <span className="ml-1.5">PNG</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>下載預覽截圖</TooltipContent>
        </Tooltip>

        <div className="mx-2 h-6 w-px bg-border" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={enterFullscreen}>
              <Maximize2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>全螢幕預覽（F11，ESC 退出）</TooltipContent>
        </Tooltip>

        {!hideSettingsPanel && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)}>
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>設定（API Key 等）</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleRight}
              className={cn(!rightOpen && 'text-muted-foreground')}
            >
              {rightOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{rightOpen ? '收合右側面板' : '展開右側面板'}（Ctrl+Alt+B）</TooltipContent>
        </Tooltip>
      </div>

      {!hideSettingsPanel && (
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      )}

      {/*
       * v0.7.5.2：重置 EDM confirm dialog。
       *
       * 不能用 native window.confirm —— 在 Electron 與某些瀏覽器整合下被禁用。
       * 也刻意不做「打字 RESET 才能確認」這種重操作 —— 對訓練師而言成本太高。
       * 兩按鈕清楚區分 destructive 紅色與普通灰色即可。
       */}
      <Dialog open={resetDialogOpen} onOpenChange={(o) => !busy && setResetDialogOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              確定要重置 EDM 嗎？
            </DialogTitle>
            <DialogDescription className="pt-2">
              此操作會：
            </DialogDescription>
          </DialogHeader>
          <ul className="-mt-2 space-y-1.5 text-sm text-muted-foreground">
            <li>• 清空所有區塊（標題、課程資訊、CTA、Hero 圖等）</li>
            <li>• 重置課程資料（名稱、地點、講師、學員等）</li>
            <li>• 還原為預設模板（Classic）與預設配色</li>
            <li>• 清除復原 / 重做歷史（按 Ctrl+Z 也回不去）</li>
            <li>• 清除本機自動存檔的草稿</li>
          </ul>
          <p className="text-sm font-medium text-destructive">
            這個操作不可復原。建議先用「下載 HTML / ZIP / PNG」備份目前作品。
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setResetDialogOpen(false)}
              disabled={!!busy}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={!!busy}
            >
              {busy === 'reset' ? '重置中…' : '確定重置'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
