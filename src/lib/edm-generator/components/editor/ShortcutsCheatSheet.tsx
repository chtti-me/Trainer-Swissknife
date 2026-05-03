/**
 * v0.4.1：鍵盤快捷鍵 cheat sheet dialog。
 *
 * 觸發方式：
 *   - 在 toolbar 點 ⌨ 按鈕
 *   - 任何位置（非輸入欄）按 `?`（Shift+/）
 *
 * 關閉方式：再按一次 `?` / 按 `Esc` / 點 dialog 外的遮罩
 *
 * 內容來自 SHORTCUT_DOCS（純資料），未來新增快捷鍵時改那裡就會自動更新此 UI。
 */

import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@edm/components/ui/dialog';
import {
  groupShortcutDocs,
  SHORTCUT_GROUP_LABELS,
  type ShortcutDoc,
  type ShortcutGroup,
} from '@edm/lib/keyboard/blockShortcuts';

interface ShortcutsCheatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GROUP_ORDER: ShortcutGroup[] = ['block', 'dialog', 'edit'];

export function ShortcutsCheatSheet({ open, onOpenChange }: ShortcutsCheatSheetProps): React.JSX.Element {
  const grouped = React.useMemo(() => groupShortcutDocs(), []);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
       * v0.7.2.1：跟 SettingsDialog 一致——用 flex + max-h-[90vh] + overflow-hidden 把 dialog 鎖在
       * viewport 內，內容區 flex-1 overflow-y-auto 自捲動，header / footer 永遠靜態可見。
       * 沒這層處理時：高解析度螢幕用 110% / 125% scaling 後，cheat sheet 會超出視窗高度，
       * 最上方 / 最下方的快捷鍵被截掉看不到。
       */}
      <DialogContent className="flex max-h-[90vh] max-w-md flex-col gap-0 overflow-hidden">
        <DialogHeader className="shrink-0 pb-3">
          <DialogTitle>鍵盤捷徑</DialogTitle>
          <DialogDescription>
            選中區塊（單擊）後，可用以下捷徑快速調整。
          </DialogDescription>
        </DialogHeader>
        <div className="-mr-2 flex-1 space-y-3 overflow-y-auto pr-2 text-sm">
          {GROUP_ORDER.map((group) => {
            const docs = grouped[group];
            if (docs.length === 0) return null;
            return (
              <ShortcutGroupSection
                key={group}
                title={SHORTCUT_GROUP_LABELS[group]}
                docs={docs}
              />
            );
          })}
        </div>
        <p className="shrink-0 border-t border-border/60 pt-3 text-[10px] text-muted-foreground">
          mac 上的 Ctrl 對應 ⌘（Cmd）。在 input／textarea／文字編輯中時所有快捷鍵都會自動禁用。
        </p>
      </DialogContent>
    </Dialog>
  );
}

/** v0.4.4：cheat sheet 內單一分組（標題 + 條列） */
function ShortcutGroupSection({
  title,
  docs,
}: {
  title: string;
  docs: ShortcutDoc[];
}): React.JSX.Element {
  return (
    <section className="space-y-1.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-1.5">
        {docs.map((doc, i) => (
          <div
            key={i}
            className="flex items-start justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-1">
              {doc.keys.map((k, j) => (
                <React.Fragment key={j}>
                  {j > 0 && <span className="text-xs text-muted-foreground">+</span>}
                  <kbd className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground shadow-sm">
                    {k}
                  </kbd>
                </React.Fragment>
              ))}
            </div>
            <span className="text-right text-xs leading-snug text-muted-foreground">
              {doc.description}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
