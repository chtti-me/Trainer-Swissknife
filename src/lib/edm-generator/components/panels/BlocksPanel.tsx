import * as React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEdmStore } from '@edm/store/edmStore';
import { useModulesStore } from '@edm/store/modulesStore';
import type { Block, BlockType } from '@edm/types/blocks';
import { Button } from '@edm/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@edm/components/ui/tabs';
import { GripVertical, Trash2, Copy, Plus, Pencil, Boxes, Layers } from 'lucide-react';
import { cn } from '@edm/lib/utils';
import { nanoid } from 'nanoid';
import { ModulesPanel } from './ModulesPanel';

export const BLOCK_LABELS: Record<BlockType, string> = {
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

export function createDefaultBlock(type: BlockType): Block {
  const id = nanoid(8);
  switch (type) {
    case 'headline':
      return { id, type, text: '新標題', align: 'center', size: 'lg' };
    case 'copy':
      // v0.7.2.1：預設 html 留空字串，由 RichTextEditor 內建的 placeholder hint
      // （:empty:not(:focus)::before + data-placeholder）顯示「在此輸入內容…」。
      // 過去寫死 '<p>在此輸入內容...</p>' 會被當成「真實文字」，使用者必須先選取
      // 並刪除才能開始輸入，體驗不佳。
      return { id, type, html: '' };
    case 'cta':
      return { id, type, label: '立即報名', url: '#', style: 'primary' };
    case 'divider':
      return { id, type, style: 'solid' };
    case 'spacer':
      // 預設 24px、完全透明 → 純間距
      return { id, type, height: 24 };
    case 'image':
      return { id, type, src: '', alt: '', width: 560, align: 'center' };
    case 'instructor':
      return { id, type, name: '姓名', role: '講師' };
    case 'footer':
      return { id, type, text: '頁尾文字' };
    case 'hero':
      return { id, type, height: 240, title: '[班名]', subtitle: '[班代號]' };
    case 'courseTable':
      return { id, type, courses: [], showInstructor: true };
    case 'classDate':
      return { id, type, label: '上課日期', dates: [], display: 'list', yearFormat: 'roc' };
    case 'classTime':
      return { id, type, label: '上課時間', startTime: '09:00', endTime: '12:00', showDuration: true };
  }
}

/**
 * v0.4.2：BlocksPanel 改成兩個 tab
 *   - 「目前 EDM」：原本的 block 列表 + 新增區塊（拆到 EdmBlocksList sub-component）
 *   - 「模組庫」：自訂模組存／取／匯入匯出（拆到 ModulesPanel）
 *
 * 模組庫 tab 上會顯示模組數量徽章；切換時 tab state 由 useModulesStore 持有，避免
 * 切換右側面板時 tab 重置。
 */
export function BlocksPanel(): React.JSX.Element {
  const moduleCount = useModulesStore((s) => s.modules.length);
  const [tab, setTab] = React.useState<'edm' | 'modules'>('edm');

  return (
    // v0.6.1：min-w-0 / overflow-hidden 一條龍
    // —— 確保窄寬下 trigger 內容能被允許縮小（grid cell 預設 min-width:auto 會被 nowrap 內容撐爆）
    <div className="min-w-0 space-y-3">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'edm' | 'modules')} className="min-w-0">
        <TabsList className="grid w-full min-w-0 grid-cols-2">
          {/* 重點：trigger 自己 min-w-0 還不夠，trigger 內的 <span> 也是 flex item，
              預設 min-width:auto，會被「目前 EDM」5 字內容撐開到 ~70px。
              span 加 min-w-0 + truncate 才會真的縮成「目前 ED…」 */}
          <TabsTrigger value="edm" className="min-w-0 gap-1 overflow-hidden px-2 text-xs">
            <Layers className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">目前 EDM</span>
          </TabsTrigger>
          <TabsTrigger value="modules" className="min-w-0 gap-1 overflow-hidden px-2 text-xs">
            <Boxes className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">模組庫</span>
            {moduleCount > 0 && (
              <span className="shrink-0 rounded bg-primary/15 px-1 py-0.5 text-[9px] font-semibold text-primary">
                {moduleCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="edm" className="mt-3 min-w-0">
          <EdmBlocksList />
        </TabsContent>
        <TabsContent value="modules" className="mt-3 min-w-0">
          <ModulesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EdmBlocksList(): React.JSX.Element {
  const blocks = useEdmStore((s) => s.blocks);
  const setBlocks = useEdmStore((s) => s.setBlocks);
  const removeBlock = useEdmStore((s) => s.removeBlock);
  const duplicateBlock = useEdmStore((s) => s.duplicateBlock);
  const selectedBlockId = useEdmStore((s) => s.selectedBlockId);
  const selectBlock = useEdmStore((s) => s.selectBlock);
  const addBlock = useEdmStore((s) => s.addBlock);
  const openBlockEditor = useEdmStore((s) => s.openBlockEditor);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = blocks.findIndex((b) => b.id === active.id);
    const newIdx = blocks.findIndex((b) => b.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    setBlocks(arrayMove(blocks, oldIdx, newIdx));
  };

  const addNew = (type: BlockType) => {
    addBlock(createDefaultBlock(type));
  };

  return (
    <div className="space-y-3">
      <header>
        <h2 className="text-sm font-semibold">EDM 區塊</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          拖曳調整順序，<strong>雙擊</strong>區塊（或預覽中的區塊）即可開啟屬性視窗編輯。
        </p>
      </header>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1">
            {blocks.map((b) => (
              <SortableItem
                key={b.id}
                block={b}
                selected={selectedBlockId === b.id}
                onSelect={() => selectBlock(b.id)}
                onEdit={() => openBlockEditor(b.id)}
                onRemove={() => removeBlock(b.id)}
                onDuplicate={() => duplicateBlock(b.id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <div className="space-y-1.5 rounded-md border border-border bg-card/40 p-2">
        <div className="text-xs font-medium text-muted-foreground">新增區塊</div>
        <div className="grid grid-cols-2 gap-1">
          {(Object.keys(BLOCK_LABELS) as BlockType[]).map((t) => (
            <Button key={t} size="sm" variant="ghost" className="justify-start text-xs" onClick={() => addNew(t)}>
              <Plus className="h-3 w-3" />
              {BLOCK_LABELS[t]}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SortableItem({
  block,
  selected,
  onSelect,
  onEdit,
  onRemove,
  onDuplicate,
}: {
  block: Block;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      onDoubleClick={onEdit}
      className={cn(
        'flex items-center gap-1 rounded-md border bg-card/40 px-1 py-1.5 transition-colors hover:border-primary/60',
        selected ? 'border-primary' : 'border-border',
      )}
    >
      <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground">
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button onClick={onSelect} className="flex-1 truncate text-left text-xs">
        <span className="font-medium">{BLOCK_LABELS[block.type]}</span>
        <span className="ml-1.5 text-muted-foreground">{summary(block)}</span>
      </button>
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onEdit} title="編輯屬性">
        <Pencil className="h-3 w-3" />
      </Button>
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onDuplicate} title="複製">
        <Copy className="h-3 w-3" />
      </Button>
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onRemove} title="刪除">
        <Trash2 className="h-3 w-3" />
      </Button>
    </li>
  );
}

function summary(b: Block): string {
  switch (b.type) {
    case 'headline':
      return b.text.slice(0, 14);
    case 'copy':
      return b.html.replace(/<[^>]+>/g, '').slice(0, 14);
    case 'cta':
      return b.label;
    case 'courseTable':
      return `${b.courses.length} 門`;
    case 'instructor':
      return b.name;
    case 'footer':
      return b.text.slice(0, 14);
    case 'hero':
      return b.image ? '已設圖' : '無圖';
    case 'image':
      return b.src ? '已設圖' : '無圖';
    case 'divider':
      return b.style;
    case 'spacer': {
      const op = typeof b.opacity === 'number' ? b.opacity : 0;
      return op > 0 ? `${b.height}px / ${Math.round(op * 100)}%` : `${b.height}px / 透明`;
    }
    case 'classDate':
      return b.dates.length > 0 ? `${b.dates.length} 日` : '尚未設定';
    case 'classTime':
      return `${b.startTime || '?'}~${b.endTime || '?'}`;
    default:
      return '';
  }
}
