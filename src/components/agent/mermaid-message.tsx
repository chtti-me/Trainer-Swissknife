"use client";

/**
 * 在 AI 對話訊息流中渲染 Mermaid 圖（前端轉 Excalidraw 手繪風格）。
 * - 動態 import `parseMermaidToExcalidraw`（mermaid-to-excalidraw）+ `convertToExcalidrawElements`（@excalidraw/excalidraw）
 * - 把 mermaid 程式碼轉成 Excalidraw scene 後，交給共用的 `<ExcalidrawMessage />` 渲染（沿用預覽 + 全屏編輯互動）
 * - 解析中顯示骨架；解析失敗顯示錯誤 + 可摺疊的原始 mermaid 程式碼
 *
 * Fallback 策略（已知套件 v2.2.2 對 classDef + subgraph 同存的兼容性問題：「SubGraph element not found」）：
 *   1. 第一次嘗試：直接用 LLM 給的 mermaid 程式碼解析
 *   2. 失敗 → 自動剝除 `classDef` 整行與 `:::xxx` 後綴，再試一次（會失去顏色但保留結構）
 *   3. 還失敗 → 顯示錯誤訊息 + 原始程式碼供 debug
 */

import { useEffect, useState } from "react";
import { AlertCircle, Info, Loader2 } from "lucide-react";

import { ExcalidrawMessage } from "./excalidraw-message";

interface SceneShape {
  type: string;
  version: number;
  source: string;
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

export interface MermaidMessageProps {
  title: string;
  mermaidCode: string;
  /** 例：flowchart / sequenceDiagram / mindmap，僅作為標題提示 */
  diagramType?: string;
}

/**
 * 剝除 mermaid 程式碼中的 classDef 整行宣告與 `:::xxx` 套用後綴，
 * 用於 fallback retry：當 mermaid-to-excalidraw 對 classDef + subgraph 解析失敗時，
 * 移除類別樣式至少能畫出結構（沒有顏色）。
 */
function stripClassDefs(code: string): { stripped: string; changed: boolean } {
  let changed = false;
  const linesKept: string[] = [];
  for (const line of code.split("\n")) {
    if (/^\s*classDef\s+/.test(line)) {
      changed = true;
      continue;
    }
    if (/^\s*class\s+[\w,\s]+\s+\w+\s*$/.test(line)) {
      // class A,B foundation 這種把節點套上 classDef 的指令
      changed = true;
      continue;
    }
    linesKept.push(line);
  }
  let stripped = linesKept.join("\n");
  if (/:::\w+/.test(stripped)) {
    stripped = stripped.replace(/:::\w+/g, "");
    changed = true;
  }
  return { stripped, changed };
}

interface ParseResult {
  elements: unknown[];
  files: Record<string, unknown>;
}

async function parseMermaid(code: string): Promise<ParseResult> {
  const [mermaidMod, excalidrawMod] = await Promise.all([
    import("@excalidraw/mermaid-to-excalidraw"),
    import("@excalidraw/excalidraw"),
  ]);
  const parseMermaidToExcalidraw = mermaidMod.parseMermaidToExcalidraw;
  const convertToExcalidrawElements = excalidrawMod.convertToExcalidrawElements;

  const result = await parseMermaidToExcalidraw(code);
  const elements = convertToExcalidrawElements(
    result.elements as Parameters<typeof convertToExcalidrawElements>[0]
  );
  return { elements, files: (result.files as Record<string, unknown>) || {} };
}

export function MermaidMessage({ title, mermaidCode, diagramType }: MermaidMessageProps) {
  const [scene, setScene] = useState<SceneShape | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setScene(null);
    setError(null);
    setWarning(null);

    (async () => {
      let primaryError: Error | null = null;

      try {
        const parsed = await parseMermaid(mermaidCode);
        if (cancelled) return;
        setScene({
          type: "excalidraw",
          version: 2,
          source: "trainer-swissknife/mermaid",
          elements: parsed.elements,
          appState: { viewBackgroundColor: "#ffffff" },
          files: parsed.files,
        });
        return;
      } catch (e) {
        primaryError = e as Error;
      }

      // Fallback：剝除 classDef + ::: 重試
      const { stripped, changed } = stripClassDefs(mermaidCode);
      if (changed && stripped.trim().length > 0) {
        try {
          const parsed = await parseMermaid(stripped);
          if (cancelled) return;
          setScene({
            type: "excalidraw",
            version: 2,
            source: "trainer-swissknife/mermaid-stripped",
            elements: parsed.elements,
            appState: { viewBackgroundColor: "#ffffff" },
            files: parsed.files,
          });
          setWarning(
            "已自動移除 classDef／類別套用語法以避開套件解析問題（圖能畫但失去顏色）。如需顏色，請改用較單純的 mermaid 寫法（不混 classDef + subgraph）。"
          );
          return;
        } catch {
          // 第二次也失敗，沿用第一次錯誤訊息
        }
      }

      if (cancelled) return;
      setError(primaryError?.message || "mermaid 解析失敗");
    })();

    return () => {
      cancelled = true;
    };
  }, [mermaidCode]);

  if (error) {
    return (
      <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs space-y-2">
        <div className="flex items-center gap-2 text-destructive font-medium">
          <AlertCircle className="h-3.5 w-3.5" />
          Mermaid 解析失敗：{title}
        </div>
        <div className="text-muted-foreground">{error}</div>
        <details className="text-[11px] text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground select-none">
            檢視原始 mermaid 程式碼
          </summary>
          <pre className="mt-1 p-2 bg-muted/30 rounded overflow-auto whitespace-pre-wrap break-all">
{mermaidCode}
          </pre>
        </details>
      </div>
    );
  }

  if (!scene) {
    return (
      <div className="mt-2 rounded-lg border bg-card overflow-hidden">
        <div className="flex items-center justify-center h-[120px] text-xs text-muted-foreground gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          解析 Mermaid 並轉成 Excalidraw…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {warning && (
        <div className="flex items-start gap-1.5 px-3 py-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md">
          <Info className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{warning}</span>
        </div>
      )}
      <ExcalidrawMessage
        title={diagramType ? `${title}（${diagramType}）` : title}
        scene={scene}
        mermaidCode={mermaidCode}
      />
    </div>
  );
}
