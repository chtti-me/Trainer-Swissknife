import * as React from 'react';
import { useEdmStore } from '@edm/store/edmStore';
import { BlockFields } from '@edm/components/editor/BlockFields';

export function PropertiesPanel(): React.JSX.Element {
  const id = useEdmStore((s) => s.selectedBlockId);
  const block = useEdmStore((s) => s.blocks.find((b) => b.id === id) ?? null);
  const updateBlock = useEdmStore((s) => s.updateBlock);

  if (!block) {
    return (
      <div className="text-xs text-muted-foreground">
        請先在「區塊」分頁或預覽中點選一個區塊，或<strong>雙擊</strong>區塊直接打開編輯視窗。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <header>
        <h2 className="text-sm font-semibold">屬性編輯</h2>
        <p className="mt-1 text-xs text-muted-foreground">{block.type}</p>
      </header>
      <BlockFields block={block} update={(patch) => updateBlock(block.id, patch)} />
    </div>
  );
}
