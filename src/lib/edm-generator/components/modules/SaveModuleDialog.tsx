/**
 * v0.4.2.1：全域 SaveModuleDialog。
 *
 * 設計：dialog 訂閱 `useModulesStore.pendingSaveRequest`，被任何 UI 呼叫
 * `requestSaveBlocks(req)` 後就會自動開啟。這樣多個入口（ModulesPanel /
 * EditableCanvas 浮動 toolbar / 未來右鍵選單）共用同一份 dialog UI 與儲存路徑。
 *
 * 對應的 mount 點：`AppShell` 全域 mount 一份。
 */

import * as React from 'react';
import { useModulesStore } from '@edm/store/modulesStore';
import { Button } from '@edm/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@edm/components/ui/dialog';
import { Input } from '@edm/components/ui/input';
import { Label } from '@edm/components/ui/label';
import { Textarea } from '@edm/components/ui/textarea';
import { toast } from '@edm/components/ui/toast';
import { Save } from 'lucide-react';

const TITLE_BY_SOURCE: Record<'single-block' | 'selected' | 'all', string> = {
  'single-block': '把這個區塊存成模組',
  selected: '把選中的區塊存成模組',
  all: '把整份 EDM 存成模組',
};

const HINT_BY_SOURCE: Record<'single-block' | 'selected' | 'all', string> = {
  'single-block': '此模組將儲存在你的瀏覽器中（localStorage），可在「模組庫」一鍵插入到任何 EDM。',
  selected: '此模組將儲存在你的瀏覽器中（localStorage），可在「模組庫」一鍵插入到任何 EDM。',
  all: '此模組將儲存在你的瀏覽器中（localStorage），等同於把整份 EDM 存為一個自訂模板。',
};

export function SaveModuleDialog(): React.JSX.Element {
  const pending = useModulesStore((s) => s.pendingSaveRequest);
  const clearRequest = useModulesStore((s) => s.clearSaveRequest);
  const saveAsModule = useModulesStore((s) => s.saveAsModule);

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [tagsRaw, setTagsRaw] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  // 每次新的 request 進來，重置欄位 + 套用 caller 給的預設名稱
  React.useEffect(() => {
    if (!pending) return;
    const today = new Date().toISOString().slice(0, 10);
    const fallback =
      pending.source === 'all' ? `EDM 模板 ${today}` : `自訂模組 ${today}`;
    setName(pending.defaultName || fallback);
    setDescription('');
    setTagsRaw('');
  }, [pending]);

  const open = pending !== null;
  const blocks = pending?.blocks ?? [];
  const source = pending?.source ?? 'selected';

  const onClose = (): void => {
    if (busy) return;
    clearRequest();
  };

  const onSave = async (): Promise<void> => {
    if (!name.trim()) {
      toast({ title: '請填寫名稱', variant: 'error' });
      return;
    }
    if (blocks.length === 0) {
      toast({ title: '沒有可儲存的區塊', variant: 'error' });
      return;
    }
    setBusy(true);
    try {
      const tags = tagsRaw
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const saved = await saveAsModule(blocks, {
        name: name.trim(),
        description: description.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });
      toast({
        title: `已儲存「${saved.name}」`,
        description: `${saved.blocks.length} 個區塊已存進模組庫`,
        variant: 'success',
      });
      clearRequest();
    } catch (err) {
      toast({ title: '儲存失敗', description: (err as Error).message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{TITLE_BY_SOURCE[source]}</DialogTitle>
          <DialogDescription>{HINT_BY_SOURCE[source]}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="mod-name">名稱</Label>
            <Input
              id="mod-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：標準收尾 / 講師卡片"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mod-desc">描述（選填）</Label>
            <Textarea
              id="mod-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="這個模組要怎麼用、什麼時候用"
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mod-tags">標籤（選填，用半形或全形逗號分隔）</Label>
            <Input
              id="mod-tags"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="例如：收尾, AI 班, 內訓"
            />
          </div>
          <div className="rounded-md border border-border/60 bg-secondary/40 p-2 text-xs text-muted-foreground">
            將儲存 <strong className="text-foreground">{blocks.length}</strong> 個區塊
            {source === 'all' ? '（整份 EDM）' : source === 'selected' ? '（選中的區塊）' : '（單一區塊）'}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={onSave} disabled={busy || !name.trim() || blocks.length === 0}>
            <Save className="h-3.5 w-3.5" />
            儲存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
