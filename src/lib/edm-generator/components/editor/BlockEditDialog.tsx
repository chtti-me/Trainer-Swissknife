import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@edm/components/ui/dialog';
import { ScrollArea } from '@edm/components/ui/scroll-area';
import { Button } from '@edm/components/ui/button';
import { Trash2, Copy } from 'lucide-react';
import { useEdmStore } from '@edm/store/edmStore';
import { BlockFields } from './BlockFields';
import type { Block, BlockType } from '@edm/types/blocks';

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  hero: 'Hero 主視覺',
  headline: '標題',
  copy: '段落文字',
  courseTable: '課程表',
  instructor: '講師 / 導師',
  cta: '行動按鈕',
  image: '圖片',
  divider: '分隔線',
  spacer: '空白行（間距）',
  footer: '頁尾',
  classDate: '上課日期',
  classTime: '上課時間',
};

/** 全域區塊編輯 Popup：訂閱 store.editingBlockId，可由任何地方（區塊面板、預覽 canvas）開啟 */
export function BlockEditDialog(): React.JSX.Element {
  const blockId = useEdmStore((s) => s.editingBlockId);
  const block = useEdmStore((s) => s.blocks.find((b) => b.id === blockId) ?? null);
  const updateBlock = useEdmStore((s) => s.updateBlock);
  const removeBlock = useEdmStore((s) => s.removeBlock);
  const duplicateBlock = useEdmStore((s) => s.duplicateBlock);
  const openBlockEditor = useEdmStore((s) => s.openBlockEditor);
  const onClose = React.useCallback(() => openBlockEditor(null), [openBlockEditor]);

  const open = blockId !== null && block !== null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>編輯區塊：{block ? BLOCK_TYPE_LABELS[block.type] : ''}</DialogTitle>
          <DialogDescription className="text-xs">
            修改後即時套用至預覽。按 Esc 或點擊外部即可關閉。
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-3">
          {block && (
            <div className="space-y-3 py-1">
              <BlockFields
                block={block}
                update={(patch: Partial<Block>) => updateBlock(block.id, patch)}
              />
            </div>
          )}
        </ScrollArea>
        <DialogFooter className="gap-2 pt-2">
          {block && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  duplicateBlock(block.id);
                  onClose();
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                複製
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  removeBlock(block.id);
                  onClose();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                刪除
              </Button>
            </>
          )}
          <div className="flex-1" />
          <Button variant="secondary" size="sm" onClick={onClose}>
            完成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
