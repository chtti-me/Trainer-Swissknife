/**
 * Agent 工具：產出 Mermaid 圖（前端會即時轉成 Excalidraw 手繪風格內嵌渲染）。
 *
 * 為什麼要有這支：raw Excalidraw JSON（excalidraw_diagram）對 LLM 不友善——
 * 要算座標、id、binding 容易出錯。改用 Mermaid 語法可大幅縮短 token、降低錯誤率。
 *
 * 流程：
 *  1. 小瑞輸出 mermaid 程式碼（例：`flowchart TD; A-->B`）
 *  2. 本工具做語法 sniff（只判斷是不是 mermaid 開頭，不做完整 parse；mermaid 真正解析在前端）
 *  3. 回傳 `{ kind: "mermaid", title, mermaidCode, diagramType }`
 *  4. 前端 `<MermaidMessage>` 動態 import `parseMermaidToExcalidraw` + `convertToExcalidrawElements`
 *     在客戶端把 mermaid 轉成 Excalidraw elements，再以 `<ExcalidrawMessage>` 樣式渲染
 *
 * 選 mermaid vs raw：
 *  - **優先 mermaid**：流程圖、序列圖、類別圖、ER 圖、Gantt、心智圖、狀態圖等 mermaid 原生支援的類型
 *  - **fallback raw**（呼叫 `excalidraw_diagram`）：自由排版、需要精確控制座標的客製化圖
 */
import "server-only";

import type { AgentToolExecutor, AgentToolResult } from "../types";

const definition = {
  name: "mermaid_diagram",
  description:
    "用 Mermaid 語法描述圖，前端會自動轉成 Excalidraw 手繪風格在對話視窗內嵌渲染（可拖、可編輯、可下載 PNG／SVG）。\n\n" +
    "## 何時用此工具（優先於 excalidraw_diagram）\n" +
    "Mermaid 原生支援這些類型，**全部優先用此工具**，因為比手刻座標短 5~10 倍且更穩定：\n" +
    "- `flowchart TD` / `flowchart LR`：流程圖（最常用）\n" +
    "- `sequenceDiagram`：序列圖（user → 系統 → DB 互動）\n" +
    "- `classDiagram`：類別圖（OOP 架構、ER 關係）\n" +
    "- `stateDiagram-v2`：狀態機\n" +
    "- `erDiagram`：資料庫實體關係\n" +
    "- `gantt`：時程甘特圖\n" +
    "- `mindmap`：心智圖\n" +
    "- `journey`：使用者旅程圖\n" +
    "- `pie`：圓餅圖\n\n" +
    "## 何時改用 excalidraw_diagram\n" +
    "需要絕對控制節點座標、不規則排版、放手繪註記等 mermaid 不擅長的客製化圖時，才 fallback 到 raw Excalidraw 工具。\n\n" +
    "## Mermaid 寫作小提醒\n" +
    "- 中文字含括號 `()`、冒號 `:` 等特殊字會被誤解析，請用引號包：`A[\"使用者(User)\"]`\n" +
    "- flowchart 的 D（decision）形狀用 `B{是否核可?}`，圓角矩形用 `C(完成)`，圓角端用 `D([開始])`\n" +
    "- 邊（edge）標籤：`A -->|是| B` 或 `A -- 失敗 --> B`\n" +
    "- 一張 mermaid ≤ 30 個節點以內最易讀；過大請拆\n",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "圖標題（顯示於對話訊息上方）",
      },
      mermaid: {
        type: "string",
        description:
          "完整 Mermaid 程式碼字串（**第一行**必須是 mermaid 圖類宣告，例：`flowchart TD`、`sequenceDiagram`、`mindmap`）。不要包成 markdown code fence（不要前後 ```）",
      },
    },
    required: ["title", "mermaid"],
  },
} as const;

const MERMAID_DIAGRAM_TYPES = [
  "flowchart",
  "graph", // mermaid 舊版 flowchart 別名
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "journey",
  "gantt",
  "pie",
  "gitGraph",
  "mindmap",
  "timeline",
  "quadrantChart",
  "requirementDiagram",
  "C4Context",
  "sankey-beta",
  "xychart-beta",
  "block-beta",
];

interface MermaidArgs {
  title: string;
  mermaid: string;
}

function detectDiagramType(code: string): string | null {
  // 取首行（去除空白與註解）
  const lines = code.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("%%")) continue; // mermaid 註解
    for (const t of MERMAID_DIAGRAM_TYPES) {
      // 大小寫不敏感、只比開頭 token
      if (new RegExp(`^${t}\\b`, "i").test(line)) return t;
    }
    return null;
  }
  return null;
}

/**
 * Flowchart label 防呆：LLM 健忘是常態，常忘記把含括號／冒號／逗號的 label 用引號包，
 * 導致 mermaid parser 把括號當成新節點形狀宣告而炸掉。本函式自動補引號。
 *
 * 範例：
 *   `A2[開發環境建置 (IDE, SDK)]:::stage1`
 *   → `A2["開發環境建置 (IDE, SDK)"]:::stage1`
 *
 * 規則：
 *   1. 只動 `[...]` 形狀（最常用、最容易踩雷）；`(...)`、`{...}` 暫不動以免誤傷 edge / decision
 *   2. 內含 `(` `)` `:` `,` `;` 任一個 → 視為需要包引號的特殊字元
 *   3. 已經被 `"..."` 包好的不動（regex 排除含 `"` 的內容）
 *   4. 子流程 `[[...]]`、資料庫 `[(...)]`、平行四邊形 `[/.../]` 等被外層 `[` `]` 包覆的形狀也適用
 *      （內部的 shape token 會跟 label 一起被包進雙引號，雖然不再是該形狀，但至少能渲染）
 */
function sanitizeFlowchartLabels(code: string): string {
  return code.replace(/\[([^\]"\n]+)\]/g, (m, inner: string) => {
    // 純空白略過
    if (!inner.trim()) return m;
    // 含問題字元才包
    if (/[(),:;]/.test(inner)) {
      return `["${inner}"]`;
    }
    return m;
  });
}

async function execute(params: Record<string, unknown>): Promise<AgentToolResult> {
  try {
    const args = params as Partial<MermaidArgs>;
    const title = String(args.title || "未命名").slice(0, 200);
    const code = String(args.mermaid || "").trim();

    if (!code) {
      return { success: false, error: "缺少 mermaid 程式碼" };
    }

    // 拆掉常見的誤包：```mermaid ... ```
    const cleaned = code
      .replace(/^```\s*mermaid\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    if (cleaned.length > 8000) {
      return { success: false, error: `mermaid 程式碼過長（${cleaned.length} > 8000 字元），請拆成多張` };
    }

    const diagramType = detectDiagramType(cleaned);
    if (!diagramType) {
      return {
        success: false,
        error:
          `mermaid 程式碼開頭未偵測到合法的圖類宣告。請在第一行寫 flowchart TD / sequenceDiagram / mindmap 等，目前看到：「${cleaned.split("\n")[0].slice(0, 40)}」`,
      };
    }

    // flowchart 自動 sanitize：補上忘記的 label 引號
    const sanitized =
      diagramType === "flowchart" || diagramType === "graph"
        ? sanitizeFlowchartLabels(cleaned)
        : cleaned;
    const wasSanitized = sanitized !== cleaned;

    return {
      success: true,
      data: {
        kind: "mermaid",
        title,
        mermaidCode: sanitized,
        diagramType,
        sanitized: wasSanitized,
        notice: wasSanitized
          ? "Mermaid 程式碼已自動補上 flowchart label 的引號（避免英文括號／冒號／逗號被誤解析），並交給前端轉成 Excalidraw 手繪風格內嵌渲染。"
          : "Mermaid 程式碼已交給前端轉成 Excalidraw 手繪風格內嵌渲染。如解析失敗會在訊息中顯示錯誤；可請使用者改用 excalidraw_diagram 走原生 Excalidraw elements。",
      },
    };
  } catch (e) {
    return {
      success: false,
      error: `mermaid_diagram 失敗：${(e as Error).message}`,
    };
  }
}

export const mermaidDiagramTool: AgentToolExecutor = { definition, execute };
