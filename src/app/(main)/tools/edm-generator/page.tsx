"use client";

/**
 * 【EDM／DM 產生器】
 * 貼文字或檔案→解析→選模板→呼叫 /api/tools/edm-generator 產 HTML。
 */
import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { parseClassInfoFromHtml, parseClassInfoFromText, buildFieldOptions } from "@/lib/edm/parser";
import { EDM_PALETTES, EDM_TEMPLATES } from "@/lib/edm/templates";
import { EdmGenerateResponse, EdmImageItem, EdmTone, ParsedClassInfo, ParsedFieldOption } from "@/lib/edm/types";
import { GripVertical, Upload, Wand2 } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";

type InputMode = "clipboard" | "html" | "ocr";

function SortableImageCard({
  image,
  onRemove,
}: {
  image: EdmImageItem;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: image.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="rounded-md border bg-card p-2 space-y-2"
    >
      <img src={image.dataUrl} alt={image.name} className="w-full h-28 object-cover rounded" />
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="inline-flex items-center text-xs text-muted-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-3 h-3 mr-1" />
          拖曳排序
        </button>
        <Button size="sm" variant="outline" onClick={() => onRemove(image.id)}>
          移除
        </Button>
      </div>
    </div>
  );
}

async function fileToText(file: File): Promise<string> {
  return await file.text();
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function downloadTextFile(content: string, name: string) {
  const blob = new Blob([content], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function runOcrWithTesseract(imageFile: File): Promise<string> {
  const Tesseract = await import("tesseract.js");
  const dataUrl = await fileToDataUrl(imageFile);
  const result = await Tesseract.recognize(dataUrl, "chi_tra+eng");
  return result.data.text || "";
}

function compressImage(file: File, maxWidth = 600): Promise<EdmImageItem> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const ratio = Math.min(1, maxWidth / image.width);
        const width = Math.round(image.width * ratio);
        const height = Math.round(image.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("無法初始化圖像畫布"));
          return;
        }
        ctx.drawImage(image, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        resolve({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: file.name,
          dataUrl,
        });
      };
      image.onerror = reject;
      image.src = String(reader.result || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function EdmGeneratorPage() {
  const [inputMode, setInputMode] = useState<InputMode>("clipboard");
  const [clipboardText, setClipboardText] = useState("");
  const [htmlRaw, setHtmlRaw] = useState("");
  const [ocrRaw, setOcrRaw] = useState("");
  const [ocrRunning, setOcrRunning] = useState(false);
  const [parseError, setParseError] = useState("");

  const [parsed, setParsed] = useState<ParsedClassInfo | null>(null);
  const [fieldOptions, setFieldOptions] = useState<ParsedFieldOption[]>([]);

  const [templateId, setTemplateId] = useState(EDM_TEMPLATES[0].id);
  const [paletteId, setPaletteId] = useState(EDM_PALETTES[0].id);
  const [tone, setTone] = useState<EdmTone>("professional");
  const [customPrompt, setCustomPrompt] = useState("");
  const [images, setImages] = useState<EdmImageItem[]>([]);

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<EdmGenerateResponse | null>(null);

  const sensors = useSensors(useSensor(PointerSensor));
  const checkedFieldKeys = useMemo(
    () => fieldOptions.filter((item) => item.checked).map((item) => item.key),
    [fieldOptions]
  );

  const parseSource = () => {
    setParseError("");
    setResult(null);
    try {
      const sourceText =
        inputMode === "clipboard" ? clipboardText : inputMode === "html" ? htmlRaw : ocrRaw;
      if (!sourceText.trim()) {
        setParseError("請先提供可解析的內容");
        return;
      }
      const parsedResult =
        inputMode === "html"
          ? parseClassInfoFromHtml(sourceText)
          : parseClassInfoFromText(sourceText);
      setParsed(parsedResult);
      setFieldOptions(buildFieldOptions(parsedResult));
    } catch (error) {
      console.error(error);
      setParseError("解析失敗，請確認輸入資料格式");
    }
  };

  const toggleField = (key: ParsedFieldOption["key"], checked: boolean) => {
    setFieldOptions((prev) =>
      prev.map((item) => (item.key === key ? { ...item, checked } : item))
    );
  };

  const onPickHtmlFile = async (file?: File) => {
    if (!file) return;
    const text = await fileToText(file);
    setHtmlRaw(text);
  };

  const onPickOcrImage = async (file?: File) => {
    if (!file) return;
    try {
      setOcrRunning(true);
      const text = await runOcrWithTesseract(file);
      setOcrRaw(text);
    } catch (error) {
      console.error(error);
      setParseError("圖片辨識失敗，請改用較清晰圖片再試一次");
    } finally {
      setOcrRunning(false);
    }
  };

  const onAddImages = async (fileList: FileList | null) => {
    if (!fileList) return;
    const incoming = Array.from(fileList).slice(0, 5 - images.length);
    const compressed = await Promise.all(incoming.map((file) => compressImage(file)));
    setImages((prev) => [...prev, ...compressed].slice(0, 5));
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = images.findIndex((item) => item.id === active.id);
    const newIndex = images.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setImages((prev) => arrayMove(prev, oldIndex, newIndex));
  };

  const onGenerate = async () => {
    if (!parsed) {
      setParseError("請先完成資料解析");
      return;
    }
    setParseError("");
    setGenerating(true);
    try {
      const response = await fetch("/api/tools/edm-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parsed,
          selectedFieldKeys: checkedFieldKeys,
          templateId,
          paletteId,
          customPrompt,
          tone,
          images,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error?.error || "EDM 生成失敗");
      }
      const payload = (await response.json()) as EdmGenerateResponse;
      setResult(payload);
    } catch (error) {
      console.error(error);
      setParseError(error instanceof Error ? error.message : "EDM 生成失敗");
    } finally {
      setGenerating(false);
    }
  };

  const onCopy = async () => {
    if (!result?.finalHtml) return;
    await navigator.clipboard.writeText(result.finalHtml);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeading
        title="EDM 產生器"
        description="支援剪貼簿、HTML 檔案與圖片 OCR 辨識，自動剖析開班資訊並產生可直接使用的 EDM。"
        titleClassName="text-3xl font-bold mb-2"
        descriptionClassName="text-muted-foreground mt-2"
      />

      <Card>
        <CardHeader>
          <CardTitle>步驟 1：匯入資料並解析</CardTitle>
          <CardDescription>可選擇文字、HTML 或圖片文字辨識來源。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as InputMode)}>
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="clipboard">剪貼簿文字</TabsTrigger>
              <TabsTrigger value="html">HTML 檔案</TabsTrigger>
              <TabsTrigger value="ocr">圖片 OCR</TabsTrigger>
            </TabsList>
            <TabsContent value="clipboard" className="space-y-2">
              <Label>貼上原始文字</Label>
              <Textarea
                rows={10}
                placeholder="請貼上開班計劃表文字內容..."
                value={clipboardText}
                onChange={(e) => setClipboardText(e.target.value)}
              />
            </TabsContent>
            <TabsContent value="html" className="space-y-2">
              <Label>上傳 HTML 檔案</Label>
              <Input type="file" accept=".html,.htm,text/html" onChange={(e) => onPickHtmlFile(e.target.files?.[0])} />
              <Textarea rows={8} value={htmlRaw} onChange={(e) => setHtmlRaw(e.target.value)} />
            </TabsContent>
            <TabsContent value="ocr" className="space-y-2">
              <Label>上傳含文字圖片</Label>
              <Input type="file" accept="image/*" onChange={(e) => onPickOcrImage(e.target.files?.[0])} />
              <Textarea
                rows={8}
                value={ocrRaw}
                onChange={(e) => setOcrRaw(e.target.value)}
                placeholder={ocrRunning ? "圖片辨識中..." : "辨識結果會顯示在此"}
              />
            </TabsContent>
          </Tabs>

          <Button onClick={parseSource} disabled={ocrRunning}>
            <Upload className="w-4 h-4 mr-2" />
            解析資料
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>步驟 2：設定模版與內容</CardTitle>
          <CardDescription>勾選要顯示的資訊，並調整模版、配色、圖片與提示詞。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label>EDM 模版</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {EDM_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={`rounded-md border p-3 text-left ${
                      template.id === templateId ? "border-primary bg-primary/5" : "border-muted"
                    }`}
                    onClick={() => setTemplateId(template.id)}
                  >
                    <div className="font-medium text-sm">{template.name}</div>
                    <div className="text-xs text-muted-foreground">{template.description}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>主題配色</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {EDM_PALETTES.map((palette) => (
                  <button
                    key={palette.id}
                    type="button"
                    className={`rounded-md border p-2 ${palette.id === paletteId ? "border-primary" : "border-muted"}`}
                    onClick={() => setPaletteId(palette.id)}
                  >
                    <div className="text-xs mb-1 text-left">{palette.name}</div>
                    <div className="flex gap-1">
                      {[palette.primary, palette.secondary, palette.accent].map((color) => (
                        <span key={color} className="w-6 h-4 rounded" style={{ backgroundColor: color }} />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>顯示欄位</Label>
              <div className="space-x-2">
                <Button size="sm" variant="outline" onClick={() => setFieldOptions((prev) => prev.map((item) => ({ ...item, checked: true })))}>
                  全選
                </Button>
                <Button size="sm" variant="outline" onClick={() => setFieldOptions((prev) => prev.map((item) => ({ ...item, checked: false })))}>
                  全部取消
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {fieldOptions.map((item) => (
                <label key={item.key} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Checkbox
                    checked={item.checked}
                    onCheckedChange={(checked) => toggleField(item.key, checked === true)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>圖片上傳（最多 5 張，可拖曳排序）</Label>
            <Input type="file" accept="image/*" multiple onChange={(e) => onAddImages(e.target.files)} />
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={images.map((item) => item.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {images.map((image) => (
                    <SortableImageCard
                      key={image.id}
                      image={image}
                      onRemove={(id) => setImages((prev) => prev.filter((item) => item.id !== id))}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>語調</Label>
              <select
                className="w-full mt-2 rounded-md border px-3 py-2 text-sm"
                value={tone}
                onChange={(e) => setTone(e.target.value as EdmTone)}
              >
                <option value="professional">專業穩健</option>
                <option value="friendly">親切友善</option>
                <option value="enthusiastic">熱情積極</option>
                <option value="formal">正式莊重</option>
              </select>
            </div>
            <div>
              <Label>提示詞</Label>
              <Textarea
                rows={4}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="例如：請強調課程實作性與對工作效能的幫助"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>步驟 3：生成與預覽</CardTitle>
          <CardDescription>有 API Key 時使用 AI 文案，否則自動使用 DEMO 文案。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={onGenerate} disabled={generating || !parsed}>
              <Wand2 className="w-4 h-4 mr-2" />
              {generating ? "生成中..." : "生成 EDM"}
            </Button>
            <Button variant="outline" disabled={!result} onClick={onCopy}>
              複製 HTML
            </Button>
            <Button
              variant="outline"
              disabled={!result}
              onClick={() => result && downloadTextFile(result.finalHtml, "edm-output.html")}
            >
              下載 HTML
            </Button>
          </div>
          {parseError && (
            <div className="rounded-md border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-sm">
              {parseError}
            </div>
          )}
          {result && (
            <div className="text-sm text-muted-foreground space-y-1">
              <div>文案模式：{result.mode === "ai" ? "AI 生成" : "DEMO 範本"}</div>
              {result.subheadline ? (
                <div className="text-xs text-foreground/80 line-clamp-2">副標：{result.subheadline}</div>
              ) : null}
            </div>
          )}
          <div className="rounded-md border overflow-hidden">
            <iframe
              title="edm-preview"
              srcDoc={result?.finalHtml || "<div style='padding:24px;font-family:sans-serif;'>尚未生成 EDM 內容</div>"}
              className="w-full min-h-[720px] h-[860px] bg-white"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
