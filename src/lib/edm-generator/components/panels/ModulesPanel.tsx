/**
 * v0.4.2：模組庫面板。
 *
 * 跟 EDM blocks panel 並列在 BlocksPanel 的 tabs 裡，使用者可以：
 *   - 把目前選中的 block 存成模組（小單位重用）
 *   - 把整個 EDM 存成模組（大模板重用）
 *   - 從模組庫卡片插入到 EDM
 *   - 刪除模組
 *   - 匯出 / 匯入 JSON（單一模組或全部）
 *
 * 整套 UI 都是訂閱 `useModulesStore`，loaded 為 false 時顯示骨架（雖然 init 都很快）。
 */

import * as React from 'react';
import { useEdmStore } from '@edm/store/edmStore';
import { useModulesStore } from '@edm/store/modulesStore';
import type { SavedModule } from '@edm/types/savedModule';
import { Button } from '@edm/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@edm/components/ui/dialog';
import { Label } from '@edm/components/ui/label';
import { Textarea } from '@edm/components/ui/textarea';
import { ScrollArea } from '@edm/components/ui/scroll-area';
import { toast } from '@edm/components/ui/toast';
import { Input } from '@edm/components/ui/input';
import {
  ArchiveRestore,
  ClipboardCopy,
  Download,
  FileDown,
  Pencil,
  Plus,
  Tag,
  Trash2,
  Upload,
  Boxes,
  Save,
} from 'lucide-react';
import { cn } from '@edm/lib/utils';
import { serializeSingleModule } from '@edm/lib/modules/helpers';

export function ModulesPanel(): React.JSX.Element {
  const modules = useModulesStore((s) => s.modules);
  const loaded = useModulesStore((s) => s.loaded);
  const removeModule = useModulesStore((s) => s.removeModule);
  const exportJson = useModulesStore((s) => s.exportJson);
  const instantiate = useModulesStore((s) => s.instantiateModuleBlocks);
  // v0.4.2.1：「儲存」走全域 SaveModuleDialog（與 EditableCanvas 浮動 toolbar 共用）
  const requestSaveBlocks = useModulesStore((s) => s.requestSaveBlocks);

  const blocks = useEdmStore((s) => s.blocks);
  const selectedBlockId = useEdmStore((s) => s.selectedBlockId);
  const insertBlocks = useEdmStore((s) => s.insertBlocks);

  const [importOpen, setImportOpen] = React.useState(false);
  // v0.4.4：點「編輯」icon 後在這裡記住要編輯哪個模組，給 EditModuleDialog 訂閱
  const [editingModule, setEditingModule] = React.useState<SavedModule | null>(null);

  const openSaveSelected = (): void => {
    if (!selectedBlockId) {
      toast({
        title: '請先選中一個區塊',
        description: '單擊一個區塊後再嘗試儲存。或改用「儲存整份 EDM」。',
        variant: 'info',
      });
      return;
    }
    const b = blocks.find((x) => x.id === selectedBlockId);
    if (!b) return;
    requestSaveBlocks({ blocks: [b], source: 'selected' });
  };

  const openSaveAll = (): void => {
    if (blocks.length === 0) {
      toast({ title: 'EDM 空白，沒有區塊可存', variant: 'info' });
      return;
    }
    requestSaveBlocks({ blocks, source: 'all' });
  };

  const insertModule = (m: SavedModule): void => {
    const newBlocks = instantiate(m.id);
    if (!newBlocks) {
      toast({ title: '找不到模組', variant: 'error' });
      return;
    }
    insertBlocks(newBlocks, 'after-selected');
    toast({
      title: `已插入「${m.name}」`,
      description: `${newBlocks.length} 個區塊已加到${selectedBlockId ? '選中區塊之後' : 'EDM 末尾'}`,
      variant: 'success',
    });
  };

  const onRemove = async (m: SavedModule): Promise<void> => {
    if (!window.confirm(`確定要刪除模組「${m.name}」？`)) return;
    await removeModule(m.id);
    toast({ title: `已刪除「${m.name}」`, variant: 'success' });
  };

  // v0.4.4：「複製 JSON」與「下載檔案」拆兩個獨立按鈕，語意明確（之前共用 Download icon 容易誤會）
  const copyModuleJson = async (m: SavedModule): Promise<void> => {
    const json = serializeSingleModule(m);
    try {
      await navigator.clipboard.writeText(json);
      toast({
        title: '已複製模組 JSON 到剪貼簿',
        description: `可貼到聊天室或 .json 檔分享給同事（${m.name}）`,
        variant: 'success',
      });
    } catch {
      toast({
        title: '剪貼簿不可用，請改用「下載檔案」',
        variant: 'error',
      });
    }
  };

  const downloadModuleJson = (m: SavedModule): void => {
    const json = serializeSingleModule(m);
    downloadJsonFile(`${m.name}.module.json`, json);
    toast({ title: `已下載「${m.name}.module.json」`, variant: 'success' });
  };

  const exportAll = async (): Promise<void> => {
    if (modules.length === 0) {
      toast({ title: '模組庫為空，沒東西可匯出', variant: 'info' });
      return;
    }
    const json = await exportJson();
    downloadJsonFile(`edm-modules-${new Date().toISOString().slice(0, 10)}.json`, json);
    toast({ title: `已下載 ${modules.length} 個模組`, variant: 'success' });
  };

  return (
    // v0.6.1：min-w-0 確保整顆 panel 在窄寬下也能正確縮放
    <div className="min-w-0 space-y-3">
      <header className="min-w-0">
        <h2 className="text-sm font-semibold">模組庫</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          把調好的版型存成可重用的「模組」，下次按一下就能插進新 EDM。
        </p>
      </header>

      {/* v0.6.1：原本 grid-cols-2 在窄面板下會被截掉；改成 flex-col 上下排列、每顆全寬，
          視覺更清爽、絕不會超寬。icon 加 shrink-0、文字 truncate 是雙保險。 */}
      <div className="flex flex-col gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          onClick={openSaveSelected}
          className="w-full justify-center text-xs"
        >
          <Save className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">存選中區塊</span>
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={openSaveAll}
          className="w-full justify-center text-xs"
        >
          <Boxes className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">存整份 EDM</span>
        </Button>
      </div>

      {!loaded ? (
        <div className="rounded-md border border-border/40 bg-card/30 px-3 py-4 text-center text-xs text-muted-foreground">
          載入模組庫…
        </div>
      ) : modules.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-card/30 px-3 py-6 text-center">
          <ArchiveRestore className="mx-auto h-6 w-6 text-muted-foreground/60" />
          <p className="mt-2 text-xs text-muted-foreground">
            還沒有任何模組。
            <br />
            選中一個區塊或按「存整份 EDM」開始建立。
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {modules.map((m) => (
            <ModuleCard
              key={m.id}
              module={m}
              onInsert={() => insertModule(m)}
              onCopyJson={() => copyModuleJson(m)}
              onDownloadJson={() => downloadModuleJson(m)}
              onEdit={() => setEditingModule(m)}
              onRemove={() => onRemove(m)}
            />
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between rounded-md border border-border/40 bg-card/30 px-2 py-1.5 text-xs">
        <span className="text-muted-foreground">{modules.length} 個模組</span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setImportOpen(true)} title="匯入 JSON">
            <Upload className="h-3 w-3" />
            匯入
          </Button>
          <Button size="sm" variant="ghost" onClick={exportAll} title="下載全部模組 JSON">
            <Download className="h-3 w-3" />
            匯出全部
          </Button>
        </div>
      </div>

      <ImportModulesDialog open={importOpen} onOpenChange={setImportOpen} />
      <EditModuleDialog
        module={editingModule}
        onClose={() => setEditingModule(null)}
      />
    </div>
  );
}

/** ────────────────── ModuleCard ────────────────── */

function ModuleCard({
  module: m,
  onInsert,
  onCopyJson,
  onDownloadJson,
  onEdit,
  onRemove,
}: {
  module: SavedModule;
  onInsert: () => void;
  /** v0.4.4：複製 JSON 到剪貼簿（給聊天室分享） */
  onCopyJson: () => void;
  /** v0.4.4：下載成 .module.json 檔案 */
  onDownloadJson: () => void;
  /** v0.4.4：開啟「編輯名稱與 tags」dialog */
  onEdit: () => void;
  onRemove: () => void;
}): React.JSX.Element {
  return (
    <li className="group rounded-md border border-border bg-card/40 px-2 py-1.5 transition-colors hover:border-primary/60">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={onInsert}
          title="插入到 EDM（會放在選中區塊之後）"
          className="min-w-0 flex-1 text-left"
        >
          <div className="truncate text-xs font-semibold">{m.name}</div>
          {m.preview && (
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {m.preview}
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span className="rounded bg-secondary/60 px-1.5 py-0.5 text-[9px] text-muted-foreground">
              {m.blocks.length} blocks
            </span>
            {m.tags?.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary"
              >
                <Tag className="h-2.5 w-2.5" />
                {t}
              </span>
            ))}
          </div>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onInsert}
            title="插入到 EDM"
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            onClick={onEdit}
            title="編輯名稱 / tags"
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={onCopyJson}
            title="複製 JSON 到剪貼簿（分享用）"
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ClipboardCopy className="h-3 w-3" />
          </button>
          <button
            onClick={onDownloadJson}
            title="下載成 .json 檔案"
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <FileDown className="h-3 w-3" />
          </button>
          <button
            onClick={onRemove}
            title="刪除模組"
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </li>
  );
}

/** ────────────────── EditModuleDialog（v0.4.4） ────────────────── */

/**
 * 編輯既有模組的 metadata（name / tags）。
 *
 * - module=null 時 dialog 關閉
 * - tags 用「逗號或空白分隔」輸入，預覽即時 split & dedupe
 * - 儲存時呼叫 store.renameModule + updateModuleTags（兩個獨立 action 避免衝突）
 */
function EditModuleDialog({
  module: m,
  onClose,
}: {
  module: SavedModule | null;
  onClose: () => void;
}): React.JSX.Element {
  const renameModule = useModulesStore((s) => s.renameModule);
  const updateModuleTags = useModulesStore((s) => s.updateModuleTags);

  const [name, setName] = React.useState('');
  const [tagsInput, setTagsInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  // module 變更時重置 form
  React.useEffect(() => {
    if (m) {
      setName(m.name);
      setTagsInput((m.tags ?? []).join(', '));
    }
  }, [m]);

  // 從輸入文字解析 tags（逗號 / 半形空白 / 全形逗號分隔）
  const parsedTags = React.useMemo(
    () =>
      Array.from(
        new Set(
          tagsInput
            .split(/[,，\s]+/)
            .map((t) => t.trim())
            .filter((t) => t.length > 0),
        ),
      ),
    [tagsInput],
  );

  const onSave = async (): Promise<void> => {
    if (!m) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: '模組名稱不可為空', variant: 'error' });
      return;
    }
    setBusy(true);
    try {
      if (trimmed !== m.name) {
        await renameModule(m.id, trimmed);
      }
      const oldTags = JSON.stringify(m.tags ?? []);
      const newTags = JSON.stringify(parsedTags);
      if (oldTags !== newTags) {
        await updateModuleTags(m.id, parsedTags);
      }
      toast({ title: '已更新模組資訊', variant: 'success' });
      onClose();
    } catch (err) {
      toast({ title: '更新失敗', description: (err as Error).message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const open = m !== null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>編輯模組</DialogTitle>
          <DialogDescription>
            修改模組的名稱與 tags（不會動到 blocks 內容）。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="edit-module-name">名稱</Label>
            <Input
              id="edit-module-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：標準商務 hero"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-module-tags">Tags</Label>
            <Input
              id="edit-module-tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="例如：商務, 春季班, hero"
            />
            <p className="text-[10px] text-muted-foreground">
              用逗號或空白分隔；空字串會自動忽略。
            </p>
            {parsedTags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {parsedTags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
                  >
                    <Tag className="h-2.5 w-2.5" />
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={onSave} disabled={busy || !name.trim()}>
            <Save className="h-3.5 w-3.5" />
            儲存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** ────────────────── ImportModulesDialog ────────────────── */

function ImportModulesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const importJson = useModulesStore((s) => s.importJson);
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [conflict, setConflict] = React.useState<'skip' | 'overwrite' | 'rename'>('skip');

  React.useEffect(() => {
    if (open) {
      setText('');
      setConflict('skip');
    }
  }, [open]);

  const onImport = async (): Promise<void> => {
    if (!text.trim()) {
      toast({ title: '請貼入 JSON 內容', variant: 'error' });
      return;
    }
    setBusy(true);
    try {
      const result = await importJson(text, { onConflict: conflict });
      const { imported, skipped, errors } = result;
      if (imported === 0 && errors.length > 0) {
        toast({
          title: '匯入失敗',
          description: errors.slice(0, 2).join('；'),
          variant: 'error',
        });
        return;
      }
      toast({
        title: `匯入完成：成功 ${imported}、跳過 ${skipped}`,
        description: errors.length > 0 ? `（有 ${errors.length} 筆解析錯誤）` : undefined,
        variant: imported > 0 ? 'success' : 'info',
      });
      onOpenChange(false);
    } catch (err) {
      toast({ title: '匯入失敗', description: (err as Error).message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const onPickFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const txt = await file.text();
    setText(txt);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>匯入模組 JSON</DialogTitle>
          <DialogDescription>
            貼上同事分享的 JSON 內容，或從檔案匯入。同 id 預設會「跳過」避免覆蓋。
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-3 py-1 pr-3">
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => onPickFile(e.target.files?.[0])}
                className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:text-foreground hover:file:bg-secondary/80"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="import-json">JSON 內容</Label>
              <Textarea
                id="import-json"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder='{"kind":"edm-generator-modules-export","modules":[...]}'
                rows={10}
                className="font-mono text-[11px]"
              />
            </div>
            <div className="space-y-1">
              <Label>遇到同 id 模組時：</Label>
              <div className="flex gap-1">
                {(['skip', 'rename', 'overwrite'] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setConflict(opt)}
                    className={cn(
                      'rounded-md border px-2 py-1 text-xs transition-colors',
                      conflict === opt
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card/40 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {opt === 'skip' ? '跳過' : opt === 'rename' ? '改 id 匯入' : '覆蓋'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button onClick={onImport} disabled={busy || !text.trim()}>
            <Upload className="h-3.5 w-3.5" />
            匯入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 把 JSON 字串包成 Blob 觸發下載（用於匯出全部 / fallback） */
function downloadJsonFile(filename: string, json: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
