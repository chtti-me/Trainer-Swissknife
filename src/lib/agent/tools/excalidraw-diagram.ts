/**
 * Agent 工具：產出 Excalidraw 手繪風格圖（流程圖／架構圖／序列圖／心智圖）。
 *
 * 設計重點：
 *  - 小瑞只需提供「最小必要欄位」（type, x, y, width, height, 外加 text/points），
 *    其他冗長的 Excalidraw 內部欄位（versionNonce、seed、roundness…）由本工具補齊預設值。
 *  - 所有元素的 id 若缺漏會自動產生（uuid v4 風格）。
 *  - 文字若指向某個容器（containerId）也會幫忙設好 boundElements 雙向關聯。
 *  - 回傳格式為 `{ kind: "excalidraw", title, scene }`，前端 MessageBubble 偵測 kind 後會
 *    用 dynamic import 的 `<ExcalidrawMessage />` 直接在對話視窗渲染（不需要連到 excalidraw.com）。
 */
import "server-only";

import { randomUUID } from "crypto";
import type { AgentToolExecutor, AgentToolResult } from "../types";

const definition = {
  name: "excalidraw_diagram",
  description:
    "建立一張 Excalidraw 手繪風格圖（流程圖、架構圖、序列圖、心智圖、概念圖等），結果會在使用者的對話視窗以可拖、可編輯的內嵌畫布顯示，預設不會送到外部雲端。\n\n" +
    "## 元素 schema（小瑞只要填這些必要欄位即可）\n" +
    "- `type`：必填。允許 `rectangle` | `ellipse` | `diamond` | `text` | `arrow` | `line` | `freedraw`\n" +
    "- `x`, `y`：必填。左上角座標（畫布原點 0,0 在左上）\n" +
    "- `width`, `height`：必填。圖形寬高；text 也建議給，否則會用預設\n" +
    "- 文字元素：另需 `text`（內容）；可選 `fontSize`（預設 20）、`fontFamily`（1=手寫風 / 2=正常 / 3=程式碼，預設 1）、`textAlign`（center / left / right）、`containerId`（指向某個 rectangle/ellipse 的 id，文字會置中於該圖形）\n" +
    "- 箭頭/線：另需 `points`（兩個或多個 [dx, dy] 相對 x,y 的偏移點，例如 `[[0,0],[200,0]]` 表示水平往右 200）；可選 `startBinding` / `endBinding`（綁到圖形 id，自動跟著移動）\n" +
    "- 配色（選填）：`strokeColor`（預設 #1e1e1e）、`backgroundColor`（預設 transparent）、`fillStyle`（hachure / cross-hatch / solid，預設 hachure）\n" +
    "- 圓角：`roundness: { type: 3 }` 讓矩形變圓角\n\n" +
    "## 建議排版\n" +
    "- 畫布從 0,0 開始；流程圖通常 y 軸由上而下、x 軸由左而右；節點寬度 160~220、高度 60~80、節點間距至少 80\n" +
    "- 一張圖盡量 ≤ 30 個元素；超過考慮分多張或留待使用者自行擴充\n" +
    "- 主要色（強調節點）建議 `#3b82f6`（藍）、次要 `#10b981`（綠）、警告 `#ef4444`（紅）、灰階 `#6b7280`\n\n" +
    "## 何時呼叫此工具\n" +
    "- 使用者明確說「畫一張…圖」「幫我畫流程圖／架構圖／序列圖／心智圖」\n" +
    "- 解釋複雜系統、需要視覺化呈現步驟或關係時，主動建議並呼叫\n" +
    "- 不要把 elements JSON 直接貼到對話文字裡——必須透過此工具回傳\n",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "圖標題；會顯示在對話訊息裡的 Excalidraw 畫布上方",
      },
      elements: {
        type: "string",
        description:
          "Excalidraw 元素 JSON 陣列字串（例：'[{\"type\":\"rectangle\",\"x\":100,\"y\":100,\"width\":200,\"height\":80}]'）；必須是合法 JSON。",
      },
      appState: {
        type: "object",
        description:
          "（選填）Excalidraw 應用狀態。常用：viewBackgroundColor（畫布底色，預設 #ffffff）、gridSize（顯示網格的格距，預設 null）",
      },
    },
    required: ["title", "elements"],
  },
} as const;

// ---- Excalidraw 元素預設欄位補齊 ----

type AnyEl = Record<string, unknown>;

function rand32() {
  return Math.floor(Math.random() * 2 ** 31);
}

function ensureId(el: AnyEl): string {
  if (typeof el.id === "string" && el.id.length > 0) return el.id;
  const id = randomUUID();
  el.id = id;
  return id;
}

const ALLOWED_TYPES = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "text",
  "arrow",
  "line",
  "freedraw",
  "image",
]);

function sanitizeElement(raw: AnyEl, idx: number): AnyEl | null {
  if (!raw || typeof raw !== "object") return null;
  const type = String(raw.type || "").trim();
  if (!ALLOWED_TYPES.has(type)) return null;

  const x = Number(raw.x ?? 0);
  const y = Number(raw.y ?? 0);
  const width = Number(raw.width ?? (type === "text" ? 100 : 120));
  const height = Number(raw.height ?? (type === "text" ? 25 : 60));
  const id = ensureId(raw);
  const seed = Number(raw.seed) || rand32();
  const angle = Number(raw.angle ?? 0);

  const base: AnyEl = {
    id,
    type,
    x,
    y,
    width,
    height,
    angle,
    strokeColor: typeof raw.strokeColor === "string" ? raw.strokeColor : "#1e1e1e",
    backgroundColor:
      typeof raw.backgroundColor === "string" ? raw.backgroundColor : "transparent",
    fillStyle: typeof raw.fillStyle === "string" ? raw.fillStyle : "hachure",
    strokeWidth: Number(raw.strokeWidth ?? 2),
    strokeStyle: typeof raw.strokeStyle === "string" ? raw.strokeStyle : "solid",
    roughness: Number(raw.roughness ?? 1),
    opacity: Number(raw.opacity ?? 100),
    groupIds: Array.isArray(raw.groupIds) ? raw.groupIds : [],
    frameId: raw.frameId ?? null,
    roundness: raw.roundness ?? (type === "rectangle" ? { type: 3 } : null),
    seed,
    version: Number(raw.version ?? 1),
    versionNonce: Number(raw.versionNonce) || rand32(),
    isDeleted: Boolean(raw.isDeleted),
    boundElements: Array.isArray(raw.boundElements) ? raw.boundElements : [],
    updated: Date.now() + idx,
    link: typeof raw.link === "string" ? raw.link : null,
    locked: Boolean(raw.locked),
  };

  if (type === "text") {
    const text = String(raw.text ?? "");
    base.text = text;
    base.originalText = typeof raw.originalText === "string" ? raw.originalText : text;
    base.fontSize = Number(raw.fontSize ?? 20);
    base.fontFamily = Number(raw.fontFamily ?? 1);
    base.textAlign = typeof raw.textAlign === "string" ? raw.textAlign : "left";
    base.verticalAlign = typeof raw.verticalAlign === "string" ? raw.verticalAlign : "top";
    base.baseline = Number(raw.baseline ?? Math.round(Number(base.fontSize) * 0.9));
    base.containerId = typeof raw.containerId === "string" ? raw.containerId : null;
    base.lineHeight = Number(raw.lineHeight ?? 1.25);
  }

  if (type === "arrow" || type === "line") {
    const fallbackPoints = [
      [0, 0],
      [width, 0],
    ];
    const points = Array.isArray(raw.points) && raw.points.length >= 2 ? raw.points : fallbackPoints;
    base.points = points;
    base.lastCommittedPoint = null;
    base.startBinding = raw.startBinding ?? null;
    base.endBinding = raw.endBinding ?? null;
    base.startArrowhead = raw.startArrowhead ?? null;
    base.endArrowhead = type === "arrow" ? (raw.endArrowhead ?? "arrow") : null;
    base.elbowed = Boolean(raw.elbowed);
  }

  if (type === "freedraw") {
    base.points = Array.isArray(raw.points) ? raw.points : [];
    base.pressures = Array.isArray(raw.pressures) ? raw.pressures : [];
    base.simulatePressure = Boolean(raw.simulatePressure ?? true);
    base.lastCommittedPoint = null;
  }

  if (type === "image") {
    base.fileId = typeof raw.fileId === "string" ? raw.fileId : null;
    base.status = typeof raw.status === "string" ? raw.status : "pending";
    base.scale = Array.isArray(raw.scale) ? raw.scale : [1, 1];
  }

  return base;
}

/** 根據 text element 的 containerId 反向補上容器的 boundElements，讓文字會跟著容器移動。 */
function linkTextContainers(elements: AnyEl[]) {
  const byId = new Map<string, AnyEl>();
  for (const el of elements) {
    if (typeof el.id === "string") byId.set(el.id, el);
  }
  for (const el of elements) {
    if (el.type === "text" && typeof el.containerId === "string") {
      const container = byId.get(el.containerId);
      if (container) {
        const bound = Array.isArray(container.boundElements) ? container.boundElements : [];
        const exists = bound.some((b) => (b as AnyEl)?.id === el.id);
        if (!exists) bound.push({ id: el.id as string, type: "text" });
        container.boundElements = bound;
        if (el.textAlign === undefined) el.textAlign = "center";
        if (el.verticalAlign === undefined) el.verticalAlign = "middle";
      }
    }
  }
}

/** 同樣處理 arrow 兩端的 binding：把 arrow 加到綁定圖形的 boundElements。 */
function linkArrowBindings(elements: AnyEl[]) {
  const byId = new Map<string, AnyEl>();
  for (const el of elements) {
    if (typeof el.id === "string") byId.set(el.id, el);
  }
  for (const el of elements) {
    if (el.type !== "arrow") continue;
    for (const sideKey of ["startBinding", "endBinding"] as const) {
      const binding = el[sideKey] as AnyEl | null;
      if (!binding || typeof binding.elementId !== "string") continue;
      const target = byId.get(binding.elementId);
      if (!target) continue;
      const bound = Array.isArray(target.boundElements) ? target.boundElements : [];
      if (!bound.some((b) => (b as AnyEl)?.id === el.id)) {
        bound.push({ id: el.id as string, type: "arrow" });
      }
      target.boundElements = bound;
      if (binding.focus === undefined) binding.focus = 0;
      if (binding.gap === undefined) binding.gap = 1;
    }
  }
}

interface DiagramArgs {
  title: string;
  elements: string;
  appState?: Record<string, unknown>;
}

async function execute(params: Record<string, unknown>): Promise<AgentToolResult> {
  try {
    const args = params as Partial<DiagramArgs>;
    const title = String(args.title || "未命名").slice(0, 200);
    const elementsRaw = String(args.elements || "").trim();
    if (!elementsRaw) {
      return { success: false, error: "缺少 elements（請提供 Excalidraw 元素 JSON 陣列字串）" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(elementsRaw);
    } catch (e) {
      return {
        success: false,
        error: `elements 不是合法 JSON：${(e as Error).message}。請只輸出純 JSON、不要含註解或結尾逗號。`,
      };
    }
    if (!Array.isArray(parsed)) {
      return { success: false, error: "elements 必須是陣列（[]）" };
    }
    if (parsed.length === 0) {
      return { success: false, error: "elements 不能為空陣列；請至少給一個圖形或文字" };
    }
    if (parsed.length > 200) {
      return { success: false, error: `elements 數量過多（${parsed.length} > 200），請拆成多張圖` };
    }

    const sanitized: AnyEl[] = [];
    const skipped: string[] = [];
    parsed.forEach((el, idx) => {
      const out = sanitizeElement(el as AnyEl, idx);
      if (out) sanitized.push(out);
      else skipped.push(`#${idx}（type=${(el as AnyEl)?.type ?? "?"}）`);
    });

    if (sanitized.length === 0) {
      return {
        success: false,
        error: `所有元素都被略過（type 不在允許清單）：${skipped.join(", ")}`,
      };
    }

    linkTextContainers(sanitized);
    linkArrowBindings(sanitized);

    const appState = {
      viewBackgroundColor: "#ffffff",
      gridSize: null,
      ...(typeof args.appState === "object" && args.appState !== null ? args.appState : {}),
    };

    const scene = {
      type: "excalidraw",
      version: 2,
      source: "trainer-swissknife/agent",
      elements: sanitized,
      appState,
      files: {},
    };

    return {
      success: true,
      data: {
        kind: "excalidraw",
        title,
        elementCount: sanitized.length,
        skippedCount: skipped.length,
        skipped: skipped.length > 0 ? skipped : undefined,
        scene,
        notice:
          "圖已渲染於對話視窗（預設為唯讀預覽，點「進入編輯」可拖拉與微調）。需要儲存或匯出 PNG／SVG，請使用畫布右上角的工具列。",
      },
    };
  } catch (e) {
    return {
      success: false,
      error: `Excalidraw 圖建立失敗：${(e as Error).message}`,
    };
  }
}

export const excalidrawDiagramTool: AgentToolExecutor = { definition, execute };
