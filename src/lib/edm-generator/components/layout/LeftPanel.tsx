import * as React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@edm/components/ui/tabs';
import { ScrollArea } from '@edm/components/ui/scroll-area';
import { ClassPlanInput } from '@edm/components/input/ClassPlanInput';
import { DataPanel } from '@edm/components/panels/DataPanel';
import { CopyPanel } from '@edm/components/panels/CopyPanel';
import { ImagePanel } from '@edm/components/panels/ImagePanel';
import { Database, Sparkles, Image as ImgIcon, FileInput } from 'lucide-react';

export function LeftPanel(): React.JSX.Element {
  return (
    <aside className="flex h-full w-full min-w-0 flex-col border-r border-border">
      <Tabs defaultValue="input" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <TabsList className="m-2 grid shrink-0 grid-cols-4 bg-secondary">
          <TabsTrigger value="input" className="text-xs">
            <FileInput className="mr-1 h-3.5 w-3.5" />
            輸入
          </TabsTrigger>
          <TabsTrigger value="data" className="text-xs">
            <Database className="mr-1 h-3.5 w-3.5" />
            資料
          </TabsTrigger>
          <TabsTrigger value="copy" className="text-xs">
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            文案
          </TabsTrigger>
          <TabsTrigger value="image" className="text-xs">
            <ImgIcon className="mr-1 h-3.5 w-3.5" />
            圖片
          </TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <TabsContent value="input" className="m-0 p-3">
              <ClassPlanInput />
            </TabsContent>
            <TabsContent value="data" className="m-0 p-3">
              <DataPanel />
            </TabsContent>
            <TabsContent value="copy" className="m-0 p-3">
              <CopyPanel />
            </TabsContent>
            <TabsContent value="image" className="m-0 p-3">
              <ImagePanel />
            </TabsContent>
          </ScrollArea>
        </div>
      </Tabs>
    </aside>
  );
}
