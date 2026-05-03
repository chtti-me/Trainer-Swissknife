/**
 * v0.5.0：AI Provider 抽象層 —— `AiAdapter` 介面。
 *
 * 動機：
 *   - 整合進「培訓師瑞士刀」（Trainer Swiss Knife）時，AI 呼叫要走 server proxy
 *     （`POST /api/tools/edm-generator/ai-text` / `/ai-image`），client 不能拿到 API key。
 *   - 桌面版（Electron）時則仍直接走 `@google/genai`（client-side key，safeStorage 加密）。
 *   - 兩種環境共用同一份 caller code（`generateCopy` / `generateImage` / `parseClassPlan` / `autoLayout`），
 *     差別只在於「哪個 AiAdapter 實例被注入」。
 *
 * 介面設計重點：
 *   - 只暴露「文字生成 + 結構化 JSON 輸出」與「圖片生成」兩個能力，與供應商無關
 *   - schema 用 plain JSON-schema-like 物件（type 為小寫字串），由 adapter 內部翻譯成
 *     供應商特有形式（Gemini 的 Type.OBJECT / OpenAI 的 strict tools）
 *   - 不暴露任何 Gemini / Imagen / OpenAI 特有的型別，避免回頭被綁死
 */

/**
 * v0.5.0：精簡版 JSON Schema —— 只支援我們實際用到的 type 與屬性。
 *
 * 不打算做全 spec 相容，只覆蓋目前 4 個 caller（generateCopy / generateImage /
 * parseClassPlan / autoLayout）真正用到的形態。新增 caller 時依需求擴充即可。
 */
export type AiJsonSchemaType =
  | 'object'
  | 'array'
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean';

export interface AiJsonSchema {
  type: AiJsonSchemaType;
  description?: string;
  /** type === 'object' 時的子欄位定義 */
  properties?: Record<string, AiJsonSchema>;
  /** type === 'object' 時的必填欄位列表 */
  required?: string[];
  /** type === 'array' 時每個元素的 schema */
  items?: AiJsonSchema;
  /** type === 'string' 時的 enum 限制（其他 type 視 adapter 實作） */
  enum?: string[];
}

/** 多模態使用者 prompt 的 part —— 文字或內聯圖片 */
export type AiUserPart =
  | { kind: 'text'; text: string }
  | { kind: 'image'; mimeType: string; base64: string };

export interface AiGenerateTextOpts {
  /** System instruction —— caller 自行串好（含模板 profile / extraSystemInstructions） */
  systemInstruction?: string;
  /** 使用者輸入；單一字串或多 part 陣列（含截圖） */
  user: string | AiUserPart[];
  /** 期望的 JSON 結構；提供 schema 表示要求結構化輸出 */
  responseSchema?: AiJsonSchema;
  /** 希望的 model 識別碼；adapter 收到後可依環境決定要不要採納（server proxy 端可固定模型） */
  model?: string;
  /** 0 ~ 1，越高越發散 */
  temperature?: number;
}

export interface AiGenerateTextResult {
  /** 模型輸出的純文字（若 caller 要求 schema，就是 JSON 字串） */
  text: string;
  /** adapter 實際使用的 model 識別碼（給 logging / 偵錯用） */
  model: string;
}

export interface AiGenerateImageOpts {
  /** 已組好的最終 prompt（含模板 visual cue / 風格 / aspect ratio 描述） */
  prompt: string;
  /** Aspect ratio，例如 '16:9' / '1:1' */
  ratio: string;
  /** 是否要圖片內含文字（會選用支援文字的模型，例如 gemini-2.5-flash-image） */
  withText?: boolean;
}

export interface AiGenerateImageResult {
  /** Base64-encoded image bytes（不含 data: 前綴） */
  base64: string;
  /** 'image/png' / 'image/jpeg' 等 */
  mimeType: string;
  /** 'data:{mime};base64,{base64}' —— 方便直接塞進 <img src> */
  dataUrl: string;
  /** adapter 實際使用的 model 識別碼 */
  model: string;
}

/**
 * 統一 AI Provider 介面。
 *
 * 所有 EDM 內部會呼叫 LLM 的位置最終都透過這個介面。
 * 預設實作 `GeminiBrowserAdapter` 直接走 `@google/genai`；
 * 未來 server proxy 實作會走 `fetch('/api/.../ai-text')`，但 caller 不需要知道。
 */
export interface AiAdapter {
  /** 文字 / 結構化 JSON 生成 */
  generateText(opts: AiGenerateTextOpts): Promise<AiGenerateTextResult>;

  /** 圖片生成 */
  generateImage(opts: AiGenerateImageOpts): Promise<AiGenerateImageResult>;

  /**
   * adapter 自我描述（給 UI / log 用）。
   *
   * - `name`：給人看的名稱（例如「Gemini（瀏覽器）」、「Trainer Academy（伺服器代理）」）
   * - `requiresApiKey`：是否需要使用者在 Settings 設定 API Key（瀏覽器 adapter = true，server proxy = false）
   */
  describe(): { name: string; requiresApiKey: boolean };
}

/** 缺 API key / adapter 沒準備好時統一拋的錯（caller 可以辨識 + 提示使用者去設定） */
export class AiAdapterNotReadyError extends Error {
  readonly code: 'no-api-key' | 'no-adapter' | 'misconfigured';
  constructor(code: 'no-api-key' | 'no-adapter' | 'misconfigured', message: string) {
    super(message);
    this.name = 'AiAdapterNotReadyError';
    this.code = code;
  }
}
