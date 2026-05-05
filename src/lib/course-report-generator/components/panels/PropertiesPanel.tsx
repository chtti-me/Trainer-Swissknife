"use client";

/**
 * 【屬性面板】右側面板，編輯選中 block 的字型/字級/顏色/邊框等。
 */
import * as React from "react";
import { useReportStore } from "../../store/reportStore";
import { useUiStore } from "../../store/uiStore";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type { CanvasBlock } from "../../types/report";

const FONT_OPTIONS = [
  "Noto Sans TC, sans-serif",
  "微軟正黑體, Microsoft JhengHei, sans-serif",
  "標楷體, DFKai-SB, BiauKai, serif",
  "Arial, sans-serif",
  "Helvetica Neue, sans-serif",
  "Times New Roman, serif",
  "Courier New, monospace",
];

export function PropertiesPanel() {
  const selectedId = useUiStore((s) => s.selectedBlockId);
  const setSelectedId = useUiStore((s) => s.setSelectedBlockId);
  const report = useReportStore((s) => s.report);
  const updateBlock = useReportStore((s) => s.updateBlock);
  const removeBlock = useReportStore((s) => s.removeBlock);

  const block = selectedId ? report.canvas.find((b) => b.id === selectedId) ?? null : null;

  if (!block) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
        請先在畫布上選取一個元素
      </div>
    );
  }

  const remove = () => {
    removeBlock(block.id);
    setSelectedId(null);
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <header className="shrink-0 px-1">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">屬性 — {kindLabel(block.kind)}</h2>
          <Button variant="ghost" size="sm" onClick={remove} className="h-7 w-7 p-0" title="刪除">
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1 pb-2">
        {/* 共用：位置與大小 */}
        <FieldGroup label="位置與大小">
          <div className="grid grid-cols-4 gap-1">
            <NumField label="X" value={block.x} onChange={(v) => updateBlock(block.id, { x: v } as Partial<CanvasBlock>)} />
            <NumField label="Y" value={block.y} onChange={(v) => updateBlock(block.id, { y: v } as Partial<CanvasBlock>)} />
            <NumField label="W" value={block.w} onChange={(v) => updateBlock(block.id, { w: v } as Partial<CanvasBlock>)} />
            <NumField label="H" value={block.h} onChange={(v) => updateBlock(block.id, { h: v } as Partial<CanvasBlock>)} />
          </div>
        </FieldGroup>

        {block.kind === "text" && <TextProps block={block} />}
        {block.kind === "image" && <ImageProps block={block} />}
        {block.kind === "table" && <TableProps block={block} />}
        {block.kind === "chart" && <ChartProps block={block} />}
      </div>
    </div>
  );
}

function kindLabel(kind: CanvasBlock["kind"]): string {
  switch (kind) {
    case "text":
      return "文字方塊";
    case "image":
      return "圖片";
    case "table":
      return "表格";
    case "chart":
      return "圖表";
  }
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border bg-card p-2">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </section>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input
        type="number"
        value={Math.round(value)}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="h-7 px-1 text-xs"
      />
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Label className="w-16 shrink-0 text-xs">{label}</Label>
      <input
        type="color"
        value={value && value !== "transparent" ? value : "#ffffff"}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-10 cursor-pointer rounded border"
      />
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#ffffff 或 transparent"
        className="h-7 flex-1 text-xs"
      />
    </div>
  );
}

function TextProps({ block }: { block: Extract<CanvasBlock, { kind: "text" }> }) {
  const updateBlock = useReportStore((s) => s.updateBlock);
  const patchStyle = (p: Partial<typeof block.style>) =>
    updateBlock(block.id, { style: { ...block.style, ...p } } as Partial<CanvasBlock>);

  return (
    <>
      <FieldGroup label="字型">
        <select
          value={block.style.fontFamily ?? FONT_OPTIONS[0]}
          onChange={(e) => patchStyle({ fontFamily: e.target.value })}
          className="h-7 w-full rounded border px-1 text-xs"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {f.split(",")[0]}
            </option>
          ))}
        </select>
        <div className="mt-1 grid grid-cols-3 gap-1">
          <div>
            <Label className="text-[10px] text-muted-foreground">字級</Label>
            <Input
              type="number"
              value={block.style.fontSize ?? 16}
              onChange={(e) => patchStyle({ fontSize: parseFloat(e.target.value) || 16 })}
              className="h-7 px-1 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">行高</Label>
            <Input
              type="number"
              step="0.1"
              value={block.style.lineHeight ?? 1.6}
              onChange={(e) => patchStyle({ lineHeight: parseFloat(e.target.value) || 1.6 })}
              className="h-7 px-1 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">內距</Label>
            <Input
              type="number"
              value={block.style.padding ?? 8}
              onChange={(e) => patchStyle({ padding: parseFloat(e.target.value) || 0 })}
              className="h-7 px-1 text-xs"
            />
          </div>
        </div>
        <div className="mt-1 flex gap-1">
          <Button
            variant={block.style.fontWeight === "bold" || (typeof block.style.fontWeight === "number" && block.style.fontWeight >= 600) ? "default" : "outline"}
            size="sm"
            onClick={() => patchStyle({ fontWeight: block.style.fontWeight === "bold" ? "normal" : "bold" })}
            className="h-7 w-7 p-0 text-xs font-bold"
            title="粗體"
          >
            B
          </Button>
          <Button
            variant={block.style.fontStyle === "italic" ? "default" : "outline"}
            size="sm"
            onClick={() => patchStyle({ fontStyle: block.style.fontStyle === "italic" ? "normal" : "italic" })}
            className="h-7 w-7 p-0 text-xs italic"
            title="斜體"
          >
            I
          </Button>
          <select
            value={block.style.textAlign ?? "left"}
            onChange={(e) => patchStyle({ textAlign: e.target.value as "left" | "center" | "right" | "justify" })}
            className="h-7 flex-1 rounded border px-1 text-xs"
          >
            <option value="left">靠左</option>
            <option value="center">置中</option>
            <option value="right">靠右</option>
            <option value="justify">兩端</option>
          </select>
        </div>
      </FieldGroup>

      <FieldGroup label="顏色">
        <div className="space-y-1">
          <ColorField label="文字色" value={block.style.color} onChange={(v) => patchStyle({ color: v })} />
          <ColorField label="背景色" value={block.style.backgroundColor} onChange={(v) => patchStyle({ backgroundColor: v })} />
        </div>
      </FieldGroup>

      <FieldGroup label="邊框">
        <div className="grid grid-cols-2 gap-1">
          <div>
            <Label className="text-[10px] text-muted-foreground">粗細</Label>
            <Input
              type="number"
              value={block.style.borderWidth ?? 0}
              onChange={(e) => patchStyle({ borderWidth: parseFloat(e.target.value) || 0 })}
              className="h-7 px-1 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">圓角</Label>
            <Input
              type="number"
              value={block.style.borderRadius ?? 0}
              onChange={(e) => patchStyle({ borderRadius: parseFloat(e.target.value) || 0 })}
              className="h-7 px-1 text-xs"
            />
          </div>
        </div>
        <div className="mt-1">
          <ColorField label="邊框色" value={block.style.borderColor} onChange={(v) => patchStyle({ borderColor: v })} />
        </div>
      </FieldGroup>
    </>
  );
}

function ImageProps({ block }: { block: Extract<CanvasBlock, { kind: "image" }> }) {
  const updateBlock = useReportStore((s) => s.updateBlock);
  return (
    <>
      <FieldGroup label="替代文字">
        <Input
          value={block.alt ?? ""}
          onChange={(e) => updateBlock(block.id, { alt: e.target.value } as Partial<CanvasBlock>)}
          className="h-7 text-xs"
        />
      </FieldGroup>
      <FieldGroup label="圓角">
        <Input
          type="number"
          value={block.borderRadius ?? 0}
          onChange={(e) => updateBlock(block.id, { borderRadius: parseFloat(e.target.value) || 0 } as Partial<CanvasBlock>)}
          className="h-7 text-xs"
        />
      </FieldGroup>
    </>
  );
}

function TableProps({ block }: { block: Extract<CanvasBlock, { kind: "table" }> }) {
  const updateBlock = useReportStore((s) => s.updateBlock);
  const patchStyle = (p: Partial<typeof block.style>) =>
    updateBlock(block.id, { style: { ...block.style, ...p } } as Partial<CanvasBlock>);

  const addRow = () => {
    const ncols = block.rows[0]?.length ?? 1;
    const next = [...block.rows, new Array(ncols).fill("")];
    updateBlock(block.id, { rows: next } as Partial<CanvasBlock>);
  };
  const addCol = () => {
    const next = block.rows.map((r) => [...r, ""]);
    // colWidths 也要同步加一欄；新欄寬度＝整體寬度的 1/N（盡量平均）
    let nextColWidths: number[] | undefined;
    if (Array.isArray(block.colWidths) && block.colWidths.length === (block.rows[0]?.length ?? 0)) {
      const avg = block.colWidths.reduce((a, b) => a + b, 0) / Math.max(1, block.colWidths.length);
      nextColWidths = [...block.colWidths, Math.max(60, Math.round(avg))];
    }
    updateBlock(block.id, {
      rows: next,
      ...(nextColWidths ? { colWidths: nextColWidths } : {}),
    } as Partial<CanvasBlock>);
  };
  const removeRow = () => {
    if (block.rows.length <= 1) return;
    updateBlock(block.id, { rows: block.rows.slice(0, -1) } as Partial<CanvasBlock>);
  };
  const removeCol = () => {
    if ((block.rows[0]?.length ?? 0) <= 1) return;
    let nextColWidths: number[] | undefined;
    if (Array.isArray(block.colWidths) && block.colWidths.length === (block.rows[0]?.length ?? 0)) {
      nextColWidths = block.colWidths.slice(0, -1);
    }
    updateBlock(block.id, {
      rows: block.rows.map((r) => r.slice(0, -1)),
      ...(nextColWidths ? { colWidths: nextColWidths } : {}),
    } as Partial<CanvasBlock>);
  };

  const resetColWidths = () => {
    // 把 colWidths 清掉 → TableBlockView 會自動 fallback 到「平均分配」
    updateBlock(block.id, { colWidths: undefined } as Partial<CanvasBlock>);
  };

  return (
    <>
      <FieldGroup label="表格結構">
        <div className="flex flex-wrap gap-1">
          <Button variant="outline" size="sm" onClick={addRow} className="h-7 px-2 text-xs">+ 列</Button>
          <Button variant="outline" size="sm" onClick={removeRow} className="h-7 px-2 text-xs">- 列</Button>
          <Button variant="outline" size="sm" onClick={addCol} className="h-7 px-2 text-xs">+ 欄</Button>
          <Button variant="outline" size="sm" onClick={removeCol} className="h-7 px-2 text-xs">- 欄</Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={resetColWidths}
            className="h-7 px-2 text-xs"
            title="把所有欄寬恢復為等寬平均分配"
            disabled={!block.colWidths}
          >
            重置欄寬
          </Button>
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={!!block.hasHeader}
            onChange={(e) => updateBlock(block.id, { hasHeader: e.target.checked } as Partial<CanvasBlock>)}
          />
          第一列為表頭
        </label>
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
          提示：選中表格後，把滑鼠移到欄與欄的交界處可拖曳改欄寬。
        </p>
      </FieldGroup>
      <FieldGroup label="樣式">
        <div className="space-y-1">
          <ColorField label="表頭背景" value={block.style.headerBg} onChange={(v) => patchStyle({ headerBg: v })} />
          <ColorField label="表頭文字" value={block.style.headerColor} onChange={(v) => patchStyle({ headerColor: v })} />
          <ColorField label="儲存格背景" value={block.style.cellBg} onChange={(v) => patchStyle({ cellBg: v })} />
          <ColorField label="儲存格文字" value={block.style.cellColor} onChange={(v) => patchStyle({ cellColor: v })} />
          <ColorField label="框線色" value={block.style.borderColor} onChange={(v) => patchStyle({ borderColor: v })} />
        </div>
      </FieldGroup>
    </>
  );
}

function ChartProps({ block }: { block: Extract<CanvasBlock, { kind: "chart" }> }) {
  const updateBlock = useReportStore((s) => s.updateBlock);
  return (
    <>
      <FieldGroup label="圖表類型">
        <select
          value={block.spec.type}
          onChange={(e) => updateBlock(block.id, { spec: { ...block.spec, type: e.target.value as typeof block.spec.type, pngDataUrl: undefined } } as Partial<CanvasBlock>)}
          className="h-7 w-full rounded border px-1 text-xs"
        >
          <option value="bar">直條圖</option>
          <option value="line">折線圖</option>
          <option value="pie">圓餅圖</option>
          <option value="doughnut">環形圖</option>
        </select>
      </FieldGroup>
      <FieldGroup label="圖表標題">
        <Input
          value={block.spec.title ?? ""}
          onChange={(e) => updateBlock(block.id, { spec: { ...block.spec, title: e.target.value, pngDataUrl: undefined } } as Partial<CanvasBlock>)}
          className="h-7 text-xs"
        />
      </FieldGroup>
      <FieldGroup label="資料">
        <p className="text-[10px] text-muted-foreground">由 AI 右鍵生成；如需編輯請刪除後重新生成。</p>
        <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-1 text-[10px]">{JSON.stringify(block.spec, null, 2).slice(0, 500)}</pre>
      </FieldGroup>
    </>
  );
}
