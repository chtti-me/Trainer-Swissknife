"use client";

/**
 * 【課程規劃報告產生器 - 主版面】
 *
 * 設計理念（v2）：放棄左+中+右三欄，改為「單欄編輯區 + 浮層選單」。
 *
 * 原因：
 *   - 三欄在窄視窗下右側面板會被截斷
 *   - 編輯報告時，「上傳資料」「模板配色」「屬性」「匯出」這些動作其實
 *     不是「常駐看著」的內容，使用者點到才需要設定，操作完就回到報告編輯
 *   - 改成浮層後，編輯區永遠擁有最大空間，不再被擠壓
 *
 * 架構：
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ 上方工具列：[上傳+AI解析] [制式表單/自由畫布]   [模板配色][屬性][匯出] │
 *   ├─────────────────────────────────────────────────────────┤
 *   │ (canvas 模式時) CanvasToolbar：插入文字/圖片/表格...        │
 *   ├─────────────────────────────────────────────────────────┤
 *   │                                                          │
 *   │              中央編輯區（FormView 或 Canvas）              │
 *   │                                                          │
 *   └─────────────────────────────────────────────────────────┘
 *
 *   點上方任一按鈕 → 對應 Dialog 浮層在中央彈出
 *   - 上傳+AI解析：可拖檔/貼筆記/抓 URL；按下「AI 解析」後關閉浮層回到編輯區
 *   - 模板配色：選好直接套用
 *   - 屬性：編輯目前選中的 canvas block
 *   - 匯出：5 種格式按鈕
 */
import * as React from "react";
import { useReportStore } from "../store/reportStore";
import { useUiStore } from "../store/uiStore";
import { UploadPanel } from "./panels/UploadPanel";
import { TemplatePicker } from "./panels/TemplatePicker";
import { ExportPanel } from "./panels/ExportPanel";
import { PropertiesPanel } from "./panels/PropertiesPanel";
import { FormView } from "./form/FormView";
import { Canvas } from "./editor/Canvas";
import { CanvasToolbar } from "./editor/CanvasToolbar";
import { AiContextMenu } from "./editor/AiContextMenu";
import { PreviewView } from "./PreviewView";
import { ExportRenderer } from "./ExportRenderer";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  LayoutTemplate,
  MousePointerClick,
  Upload,
  Palette as PaletteIcon,
  Download,
  Sliders,
  Sparkles,
  Eye,
} from "lucide-react";
import { getTemplate } from "../lib/templates";
import { getPalette } from "../lib/palettes";
import { useToast } from "@/components/ui/toaster";

interface Props {
  userId: string;
}

// 浮層的種類；null = 無浮層
type ModalKind = "upload" | "templates" | "properties" | "preview" | "export" | null;

export function AppShell({ userId }: Props) {
  const report = useReportStore((s) => s.report);
  const setMode = useReportStore((s) => s.setMode);
  const setCanvas = useReportStore((s) => s.setCanvas);
  const selectedBlockId = useUiStore((s) => s.selectedBlockId);
  const aiBusy = useUiStore((s) => s.aiBusy);
  const { toast } = useToast();
  const formStageRef = React.useRef<HTMLDivElement>(null);
  const canvasStageRef = React.useRef<HTMLDivElement>(null);
  /**
   * 永遠掛載在畫面外的 read-only 渲染容器。
   * PNG / PDF / PPTX(form 截圖) / HTML / DOC(canvas) 五種匯出
   * 都改去擷取這個 DOM——它就是「預覽畫面」的全尺寸版本，
   * 不會有編輯介面的 input/textarea，也沒有 transform: scale 帶來的邊界裁切。
   */
  const exportRootRef = React.useRef<HTMLDivElement>(null);
  const [modal, setModal] = React.useState<ModalKind>(null);

  // 切到 canvas 模式時：若 canvas 為空，自動用模板生成初始版型
  const handleSwitchMode = (mode: "form" | "canvas") => {
    if (mode === "canvas" && report.canvas.length === 0) {
      const template = getTemplate(report.templateId);
      const palette = getPalette(report.paletteId);
      const blocks = template.renderCanvasInitial(report, palette);
      setCanvas(blocks);
      toast("已根據目前模板自動產生畫布版型", "success");
    }
    // 切到 canvas 時若「模板配色」對話框還開著，順手關掉，
    // 避免使用者在 canvas 模式還能透過殘存的對話框做切換、結果發現
    // 完全不會反映在當前畫布上。
    if (mode === "canvas" && modal === "templates") {
      setModal(null);
    }
    setMode(mode);
  };

  /**
   * 取「給匯出用」的 DOM。
   *
   * ⚠️ 關鍵設計：不要回傳正在編輯的 stage（formStageRef / canvasStageRef）。
   * 那兩個 stage 充滿 native <input> / <textarea>，html2canvas 即使搭配
   * onclone 補救還是會出現「文字偏下、表格右側被切」等視覺缺陷。
   *
   * 改成回傳 ExportRenderer（永遠 mount 在畫面外）的根節點——
   * 那是 readOnly 模式的全尺寸渲染，與「預覽」按鈕看到的版本同源同 layout，
   * 直接擷取就會得到使用者期待的成品。
   */
  const getExportRoot = (): HTMLElement | null => exportRootRef.current;

  // AI 處理中時，禁止關閉 upload 對話框（避免 user 不小心關掉看不到結果）
  const handleModalChange = (kind: ModalKind, open: boolean) => {
    if (!open) {
      if (kind === "upload" && aiBusy) return;
      setModal(null);
    }
  };

  return (
    <div
      className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden bg-background"
    >
      {/* 上方工具列。flex-wrap 讓窄視窗時自動換行，避免「屬性 / 匯出」按鈕被截掉 */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b bg-card px-3 py-2">
        <Button
          onClick={() => setModal("upload")}
          size="sm"
          variant="default"
          className="h-8 gap-1.5"
        >
          {aiBusy ? (
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {aiBusy ? "AI 解析中…" : "上傳資料 + AI 解析"}
        </Button>

        <div className="ml-2 flex items-center gap-1">
          <span className="hidden text-xs text-muted-foreground md:inline">編輯模式：</span>
          <Tabs value={report.mode} onValueChange={(v) => handleSwitchMode(v as "form" | "canvas")}>
            <TabsList className="h-8">
              <TabsTrigger value="form" className="gap-1 text-xs">
                <LayoutTemplate className="h-3.5 w-3.5" /> 制式表單
              </TabsTrigger>
              <TabsTrigger value="canvas" className="gap-1 text-xs">
                <MousePointerClick className="h-3.5 w-3.5" /> 自由畫布
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/*
          ml-auto 把右側群組推到最右；再多套一個 flex-wrap，當「右側群組整體」自己
          也塞不下時，會自動內部再換行，而不是被父層 overflow-hidden 切掉。
        */}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {/*
            模板配色：只在「制式表單」模式顯示。
            理由：制式表單模式才會直接套用模板的 renderForm + palette 顏色，
            切換馬上反映在使用者眼前；自由畫布模式使用者已經自由排版，
            模板/配色切換不會立刻反映到既有 block 的個別屬性，按了會困惑。
            （若想換配色，請選取個別 block 在「屬性」面板調整）
          */}
          {report.mode === "form" && (
            <Button
              onClick={() => setModal("templates")}
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              title="切換模板與配色"
            >
              <PaletteIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">模板配色</span>
            </Button>
          )}
          {report.mode === "canvas" && (
            <Button
              onClick={() => setModal("properties")}
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              disabled={!selectedBlockId}
              title={!selectedBlockId ? "請先在畫布上選取一個元素" : "編輯選中元素的屬性"}
            >
              <Sliders className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">屬性</span>
            </Button>
          )}
          <Button
            onClick={() => setModal("preview")}
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            title="預覽完成後的呈現效果（不下載）"
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">預覽</span>
          </Button>
          <Button
            onClick={() => setModal("export")}
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            title="匯出報告"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">匯出</span>
          </Button>
        </div>
      </div>

      {/* 自由畫布的次工具列（插入文字/圖片/表格、Undo/Redo 等） */}
      {report.mode === "canvas" && <CanvasToolbar />}

      {/*
        中央單欄編輯區。
        - flex-1：吃完剩餘垂直空間
        - min-h-0 / min-w-0：在 flex-col 內必須加，否則內含 overflow-auto 不會生效
        - max-w-full：強制不超過父容器寬度（防止 Canvas 1280px 內容反向把版面撐爆）
        - overflow-auto：內容超出時用滾動條，不去推父容器尺寸
      */}
      <div className="min-h-0 min-w-0 max-w-full flex-1 overflow-auto bg-muted/20 p-4">
        {report.mode === "form" ? (
          <FormView ref={formStageRef} stageWidth={1024} />
        ) : (
          <Canvas ref={canvasStageRef} />
        )}
      </div>

      {/* ─── 浮層選單們 ─── */}

      {/* 上傳資料 + AI 解析 */}
      <Dialog open={modal === "upload"} onOpenChange={(o) => handleModalChange("upload", o)}>
        <DialogContent className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" /> 上傳資料 + AI 解析
            </DialogTitle>
            <DialogDescription>
              上傳檔案、貼上筆記、提供 TIS 網址，AI 會自動萃取整理為報告草稿
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <UploadPanel userId={userId} onAfterAiExtract={() => setModal(null)} />
          </div>
        </DialogContent>
      </Dialog>

      {/* 模板配色 */}
      <Dialog open={modal === "templates"} onOpenChange={(o) => handleModalChange("templates", o)}>
        <DialogContent className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle className="flex items-center gap-2">
              <PaletteIcon className="h-5 w-5" /> 模板與配色
            </DialogTitle>
            <DialogDescription>
              點選即時套用；改了不喜歡可直接再選別的
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <TemplatePicker />
          </div>
        </DialogContent>
      </Dialog>

      {/* 屬性面板（只在 canvas 模式有） */}
      <Dialog
        open={modal === "properties"}
        onOpenChange={(o) => handleModalChange("properties", o)}
      >
        <DialogContent className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle className="flex items-center gap-2">
              <Sliders className="h-5 w-5" /> 元素屬性
            </DialogTitle>
            <DialogDescription>
              編輯目前選中元素的字型、顏色、邊框、位置等
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <PropertiesPanel />
          </div>
        </DialogContent>
      </Dialog>

      {/*
        預覽：把編輯區換成「拿掉所有編輯介面」的版本，
        讓使用者所見即所得地確認版面，再決定要不要匯出。
        Dialog 寬度刻意拉大（max-w-6xl），給 1024 / 1280 寬的 stage 比較好的縮放空間。
      */}
      <Dialog open={modal === "preview"} onOpenChange={(o) => handleModalChange("preview", o)}>
        <DialogContent className="flex h-[90vh] w-[95vw] max-w-6xl flex-col overflow-hidden p-0 sm:max-w-6xl">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              預覽（{report.mode === "form" ? "制式表單" : "自由畫布"}模式）
            </DialogTitle>
            <DialogDescription>
              這就是匯出後的呈現效果；確認沒問題後再回到編輯區或直接點「匯出」。
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden">
            <PreviewView />
          </div>
        </DialogContent>
      </Dialog>

      {/* 匯出 */}
      <Dialog open={modal === "export"} onOpenChange={(o) => handleModalChange("export", o)}>
        <DialogContent className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" /> 匯出報告
            </DialogTitle>
            <DialogDescription>
              依目前的編輯模式，提供最合適的輸出格式
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <ExportPanel getExportRoot={getExportRoot} />
          </div>
        </DialogContent>
      </Dialog>

      {/* AI 右鍵選單（fixed positioned） */}
      <AiContextMenu />

      {/*
        匯出用的隱藏渲染容器：
          固定 mount 在畫面外（自身 outer div 用 left:-99999），不會干擾使用者編輯。
          所有 DOM-based 匯出（PNG/PDF/HTML/DOC/PPTX-form）都從這裡擷取，
          確保看到的 = 預覽 = 匯出三者一致。
      */}
      <ExportRenderer ref={exportRootRef} />
    </div>
  );
}
