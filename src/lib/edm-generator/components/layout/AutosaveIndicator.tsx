/**
 * v0.7.5.0 / v0.7.5.1：AutosaveIndicator —— TopToolbar 上的「自動存檔」狀態徽章。
 *
 * # v0.7.5.1 收斂
 *
 * 使用者反饋：「儲存狀態的顯示，必須再簡化，在頁面上只需要顯示已儲存、儲存中…等
 * 不同狀態，並以適當的顏色表示，其他『上次寫入：2026/5/2 下午 10:29:57』、『已儲存
 * 於 18 分鐘前』這些字樣，則是當使用者將滑鼠 hover 到已儲存、儲存中…等不同狀態
 * 的字樣上方時，才會顯示。這麼做的目的，是不要讓頁面上顯示的資訊過多，反而干擾了
 * 使用者製作 EDM。」
 *
 *   - **頁面**：只顯極短狀態詞（「已儲存」/「儲存中…」/「儲存失敗」/「未啟用」/
 *               「就緒」）+ icon + 顏色，無時間
 *   - **Tooltip**：完整詳情：絕對時間戳、相對時間（N 秒前 / N 分鐘前 / N 小時前）、
 *                  錯誤訊息、上次成功儲存時間
 *
 * # 5 個 kind 對應 5 種視覺
 *
 *   - idle      → 「就緒」（灰色 Cloud；剛啟動還沒第一次寫）
 *   - saving    → 「儲存中…」（藍色 Loader2 spin）
 *   - saved     → 「已儲存」（綠色 Check）
 *   - error     → 「儲存失敗」（紅色 AlertCircle）
 *   - disabled  → 「未啟用」（淡灰色 CloudOff）
 *
 * 使用者最在乎「我的東西有沒有真的存下來」，所以這個 indicator 必須一直可見且夠搶眼
 * （綠 / 藍 / 紅），但**頁面只露最少資訊**，把詳情藏在 tooltip 不干擾主編輯區。
 */

import * as React from 'react';
import { Cloud, CloudOff, AlertCircle, Loader2, Check } from 'lucide-react';
import { useDraftStatusStore } from '@edm/store/draftStatusStore';
import { Tooltip, TooltipContent, TooltipTrigger } from '@edm/components/ui/tooltip';
import { cn } from '@edm/lib/utils';

function formatRelative(ms: number, now: number): string {
  const diff = Math.max(0, now - ms);
  const sec = Math.round(diff / 1000);
  if (sec < 5) return '剛剛';
  if (sec < 60) return `${sec} 秒前`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const day = Math.round(hr / 24);
  return `${day} 天前`;
}

function formatAbsolute(ms: number): string {
  return new Date(ms).toLocaleString('zh-TW');
}

export function AutosaveIndicator(): React.JSX.Element | null {
  const status = useDraftStatusStore((s) => s.status);

  // 相對時間（「N 秒前」/「N 分鐘前」）只在 tooltip 裡顯示，但仍每秒 re-render
  // 才能讓 hover 時看到的數字是新的
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (status.kind !== 'saved' && status.kind !== 'error') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status.kind]);

  let icon: React.JSX.Element;
  let label: string;
  /** tooltip 主訊息（粗體那行） */
  let tooltipPrimary: string;
  /** tooltip 副訊息（小字那行；可省略） */
  let tooltipSecondary: string | null = null;
  let dotClass: string;

  switch (status.kind) {
    case 'idle':
      icon = <Cloud className="h-3.5 w-3.5" />;
      label = '就緒';
      tooltipPrimary = '自動存檔已啟用';
      tooltipSecondary = '使用者編輯後 0.8 秒會自動寫入本機儲存';
      dotClass = 'text-muted-foreground';
      break;
    case 'saving':
      icon = <Loader2 className="h-3.5 w-3.5 animate-spin" />;
      label = '儲存中…';
      tooltipPrimary = '正在寫入本機儲存';
      dotClass = 'text-blue-500';
      break;
    case 'saved':
      icon = <Check className="h-3.5 w-3.5" />;
      label = '已儲存';
      tooltipPrimary = `已儲存於 ${formatRelative(status.savedAt, now)}`;
      tooltipSecondary = `上次寫入：${formatAbsolute(status.savedAt)}`;
      dotClass = 'text-emerald-600 dark:text-emerald-400';
      break;
    case 'error':
      icon = <AlertCircle className="h-3.5 w-3.5" />;
      label = '儲存失敗';
      tooltipPrimary = `寫入錯誤：${status.error}`;
      tooltipSecondary = status.lastSavedAt
        ? `上次成功儲存：${formatRelative(status.lastSavedAt, now)}（${formatAbsolute(status.lastSavedAt)}）`
        : '尚未有任何成功的儲存記錄';
      dotClass = 'text-destructive';
      break;
    case 'disabled':
      icon = <CloudOff className="h-3.5 w-3.5" />;
      label = '未啟用';
      tooltipPrimary = '未啟用自動存檔';
      tooltipSecondary = '目前環境不支援自動存檔（或宿主應用已注入 Noop adapter）';
      dotClass = 'text-muted-foreground/60';
      break;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'flex shrink-0 cursor-default items-center gap-1 rounded px-1.5 py-0.5 text-xs',
            dotClass,
          )}
          aria-label={`自動存檔狀態：${label}`}
        >
          {icon}
          <span className="whitespace-nowrap">{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="font-medium">{tooltipPrimary}</div>
        {tooltipSecondary && (
          <div className="mt-1 text-[11px] text-muted-foreground">{tooltipSecondary}</div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
