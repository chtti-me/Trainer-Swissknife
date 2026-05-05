"use client";

/**
 * 【自由畫布工具列】
 * 插入文字 / 圖片 / 表格；undo / redo；切換到制式表單模式按鈕。
 */
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Type,
  Image as ImageIcon,
  Table as TableIcon,
  Undo2,
  Redo2,
  RotateCcw,
} from "lucide-react";
import { useReportStore, defaultTableStyle, defaultTextStyle } from "../../store/reportStore";
import { useUiStore } from "../../store/uiStore";
import { newId } from "../../lib/utils";
import type { CanvasBlock } from "../../types/report";
import { useToast } from "@/components/ui/toaster";
import { getTemplate } from "../../lib/templates";
import { getPalette } from "../../lib/palettes";

export function CanvasToolbar() {
  const addBlock = useReportStore((s) => s.addBlock);
  const undo = useReportStore((s) => s.undo);
  const redo = useReportStore((s) => s.redo);
  const canUndo = useReportStore((s) => s.canUndo());
  const canRedo = useReportStore((s) => s.canRedo());
  const setSelectedBlockId = useUiStore((s) => s.setSelectedBlockId);
  const setCanvas = useReportStore((s) => s.setCanvas);
  const report = useReportStore((s) => s.report);
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleInsertText = () => {
    const block: CanvasBlock = {
      kind: "text",
      id: newId(),
      x: 100,
      y: 100,
      w: 480,
      h: 120,
      html: "在此輸入文字…",
      style: { ...defaultTextStyle },
    };
    addBlock(block);
    setSelectedBlockId(block.id);
  };

  const handleInsertTable = () => {
    const block: CanvasBlock = {
      kind: "table",
      id: newId(),
      x: 100,
      y: 200,
      w: 800,
      h: 180,
      rows: [
        ["日期", "時間", "課程", "講師", "亮點"],
        ["", "", "", "", ""],
        ["", "", "", "", ""],
      ],
      hasHeader: true,
      style: { ...defaultTableStyle },
    };
    addBlock(block);
    setSelectedBlockId(block.id);
  };

  const handleInsertImage = () => fileInputRef.current?.click();

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast("請選擇圖片檔", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const block: CanvasBlock = {
        kind: "image",
        id: newId(),
        x: 100,
        y: 300,
        w: 480,
        h: 320,
        src: String(reader.result || ""),
        alt: file.name,
        borderRadius: 8,
      };
      addBlock(block);
      setSelectedBlockId(block.id);
    };
    reader.readAsDataURL(file);
  };

  const handleRebuildFromTemplate = () => {
    if (!confirm("重新從目前的「制式表單欄位」產生畫布版型，會清除目前的自由編輯內容。確定？")) return;
    const template = getTemplate(report.templateId);
    const palette = getPalette(report.paletteId);
    const blocks = template.renderCanvasInitial(report, palette);
    setCanvas(blocks);
    setSelectedBlockId(null);
    toast("已根據表單欄位重新產生畫布", "success");
  };

  return (
    <div className="flex w-full min-w-0 max-w-full shrink-0 flex-wrap items-center gap-1 border-b bg-card px-2 py-1.5">
      <span className="px-2 text-xs font-semibold text-muted-foreground">插入：</span>
      <Button variant="outline" size="sm" onClick={handleInsertText} className="h-7 gap-1 px-2 text-xs">
        <Type className="h-3.5 w-3.5" /> 文字
      </Button>
      <Button variant="outline" size="sm" onClick={handleInsertImage} className="h-7 gap-1 px-2 text-xs">
        <ImageIcon className="h-3.5 w-3.5" /> 圖片
      </Button>
      <Button variant="outline" size="sm" onClick={handleInsertTable} className="h-7 gap-1 px-2 text-xs">
        <TableIcon className="h-3.5 w-3.5" /> 表格
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) handleFile(e.target.files[0]);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
      />

      <span className="ml-3 px-2 text-xs font-semibold text-muted-foreground">編輯：</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={undo}
        disabled={!canUndo}
        title="復原 (Ctrl+Z)"
        className="h-7 w-7 p-0"
      >
        <Undo2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={redo}
        disabled={!canRedo}
        title="重做 (Ctrl+Y)"
        className="h-7 w-7 p-0"
      >
        <Redo2 className="h-3.5 w-3.5" />
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={handleRebuildFromTemplate}
        className="ml-3 h-7 gap-1 px-2 text-xs"
        title="根據目前的表單欄位 + 模板，重新產生畫布版型"
      >
        <RotateCcw className="h-3.5 w-3.5" /> 從表單重建版型
      </Button>
    </div>
  );
}
