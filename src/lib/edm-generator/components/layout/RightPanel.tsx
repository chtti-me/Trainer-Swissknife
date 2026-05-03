import * as React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@edm/components/ui/tabs';
import { ScrollArea } from '@edm/components/ui/scroll-area';
import { TemplatePanel } from '@edm/components/panels/TemplatePanel';
import { ColorPanel } from '@edm/components/panels/ColorPanel';
import { BlocksPanel } from '@edm/components/panels/BlocksPanel';
import { PropertiesPanel } from '@edm/components/panels/PropertiesPanel';
import { LayoutTemplate, Palette, LayoutList, SlidersHorizontal } from 'lucide-react';

export function RightPanel(): React.JSX.Element {
  return (
    <aside className="flex h-full w-full min-w-0 flex-col border-l border-border">
      <Tabs defaultValue="template" className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* v0.6.1：min-w-0 + 縮 padding 讓 4 個 trigger 在窄寬下也能塞下；
            trigger 內 <span> 也加 min-w-0 truncate，否則 truncate 不會生效（flex item 預設 min-width:auto）。
            極窄寬下 (< 180px) 文字會自動隱藏，只留 icon —— 這是用 `hidden`/`@container` 不可靠時的最務實做法。 */}
        <TabsList className="m-2 grid min-w-0 shrink-0 grid-cols-4 bg-secondary">
          <TabsTrigger value="template" className="min-w-0 gap-1 overflow-hidden px-1 text-xs">
            <LayoutTemplate className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">模板</span>
          </TabsTrigger>
          <TabsTrigger value="color" className="min-w-0 gap-1 overflow-hidden px-1 text-xs">
            <Palette className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">配色</span>
          </TabsTrigger>
          <TabsTrigger value="blocks" className="min-w-0 gap-1 overflow-hidden px-1 text-xs">
            <LayoutList className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">區塊</span>
          </TabsTrigger>
          <TabsTrigger value="props" className="min-w-0 gap-1 overflow-hidden px-1 text-xs">
            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">屬性</span>
          </TabsTrigger>
        </TabsList>
        {/* min-h-0 / min-w-0 是關鍵：讓 flex-1 子節點能在內容超過容器尺寸時被允許 shrink，
            否則 ScrollArea 內部 viewport 會被內容撐到無限高 / 無限寬。 */}
        <div className="min-h-0 min-w-0 flex-1">
          <ScrollArea className="h-full">
            <TabsContent value="template" className="m-0 min-w-0 p-3">
              <TemplatePanel />
            </TabsContent>
            <TabsContent value="color" className="m-0 min-w-0 p-3">
              <ColorPanel />
            </TabsContent>
            <TabsContent value="blocks" className="m-0 min-w-0 p-3">
              <BlocksPanel />
            </TabsContent>
            <TabsContent value="props" className="m-0 min-w-0 p-3">
              <PropertiesPanel />
            </TabsContent>
          </ScrollArea>
        </div>
      </Tabs>
    </aside>
  );
}
