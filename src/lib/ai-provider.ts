import "server-only";
import OpenAI from "openai";
import { getProviderCatalog, PROVIDER_CATALOG } from "./ai-providers/catalog";
import { isAiProvider, VALID_PROVIDERS, type AiProvider } from "./ai-provider-types";

// 重新匯出，讓既有 import "@/lib/ai-provider" 直接拿到 AiProvider 型別不用改
export type { AiProvider };
export { isAiProvider };

/**
 * 「功能」識別字。每個功能可獨立指定 AI 供應商與模型，互不干擾。
 *
 * 解析優先序：
 *   1. 呼叫端傳入 explicit override（例如 `CoursePlanRequest.aiProvider` 欄位）
 *   2. 功能專屬 env（例如 `COURSE_PLANNER_AI_PROVIDER`）
 *   3. 全站預設 env（`AI_PROVIDER`）
 */
export type AiFeature = "course_planner" | "course_report" | "edm" | "agent" | "default";

const FEATURE_ENV_PROVIDER: Record<AiFeature, string | null> = {
  course_planner: "COURSE_PLANNER_AI_PROVIDER",
  course_report: "COURSE_REPORT_AI_PROVIDER",
  edm: "EDM_AI_PROVIDER",
  agent: "AGENT_AI_PROVIDER",
  default: null,
};

const FEATURE_ENV_MODEL: Record<AiFeature, string | null> = {
  course_planner: "COURSE_PLANNER_AI_MODEL",
  course_report: "COURSE_REPORT_AI_MODEL",
  edm: "EDM_AI_MODEL",
  agent: "AGENT_AI_MODEL",
  default: null,
};

function normalizeProvider(raw: string | null | undefined): AiProvider | null {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return null;
  if ((VALID_PROVIDERS as readonly string[]).includes(v)) return v as AiProvider;
  return null;
}

/** 全站預設供應商（讀 AI_PROVIDER；不認識的字串都當 openai） */
export function getAiProvider(): AiProvider {
  return normalizeProvider(process.env.AI_PROVIDER) ?? "openai";
}

/**
 * 解析「特定功能該用哪家 AI」。
 *
 * @param feature   功能識別字（course_planner / edm / agent / default）
 * @param explicit  從資料庫 / 使用者選擇傳進來的硬性指定（會蓋過 env）
 */
export function getAiProviderFor(feature: AiFeature, explicit?: AiProvider | string | null): AiProvider {
  const fromExplicit = normalizeProvider(typeof explicit === "string" ? explicit : null);
  if (fromExplicit) return fromExplicit;

  const envKey = FEATURE_ENV_PROVIDER[feature];
  if (envKey) {
    const fromFeatureEnv = normalizeProvider(process.env[envKey]);
    if (fromFeatureEnv) return fromFeatureEnv;
  }
  return getAiProvider();
}

/** 取某 provider 的 API key（讀對應 env，未設回空字串） */
export function getAiProviderApiKey(provider: AiProvider): string {
  const cat = getProviderCatalog(provider);
  if (!cat) return "";
  return process.env[cat.envVars.apiKey]?.trim() || "";
}

/** 取某 provider 的 base URL；env 未設則用 catalog 的 default */
function getAiProviderBaseUrl(provider: AiProvider): string {
  const cat = getProviderCatalog(provider);
  if (!cat) return "";
  return process.env[cat.envVars.baseUrl]?.trim() || cat.defaultBaseUrl;
}

/** 該供應商的 「全功能 fallback 預設模型」（沒有特別指定功能模型時用這個） */
export function getDefaultModel(provider: AiProvider): string {
  const cat = getProviderCatalog(provider);
  if (!cat) return "";
  return process.env[cat.envVars.chatModel]?.trim() || cat.defaultChatModel;
}

/**
 * 課程規劃幫手專用模型解析。
 * 解析序：`{PROVIDER}_MODEL_PLANNING` → `getDefaultModel(provider)`
 */
export function getPlanningModel(provider: AiProvider): string {
  const cat = getProviderCatalog(provider);
  if (!cat) return getDefaultModel(provider);
  const planningEnv = cat.envVars.planningModel;
  if (planningEnv) {
    const v = process.env[planningEnv]?.trim();
    if (v) return v;
  }
  return cat.defaultPlanningModel || getDefaultModel(provider);
}

/**
 * 解析「特定功能 + 供應商」用什麼模型。
 *
 * 解析序：
 *   1. 功能專屬 env（例如 `COURSE_PLANNER_AI_MODEL`，跨供應商通用名稱）
 *   2. 課程規劃幫手特例：走 `getPlanningModel(provider)`
 *   3. `getDefaultModel(provider)`
 */
export function getModelFor(feature: AiFeature, provider: AiProvider): string {
  const featureEnv = FEATURE_ENV_MODEL[feature];
  if (featureEnv) {
    const v = process.env[featureEnv]?.trim();
    if (v) return v;
  }
  if (feature === "course_planner") return getPlanningModel(provider);
  return getDefaultModel(provider);
}

/** 是否已設定預設供應商的 API key（給「先檢查再呼叫」用） */
export function hasConfiguredAiApiKey(): boolean {
  return Boolean(getAiProviderApiKey(getAiProvider()));
}

/** 指定供應商的 API key 是否設好 */
export function hasConfiguredApiKeyFor(provider: AiProvider): boolean {
  return Boolean(getAiProviderApiKey(provider));
}

/**
 * 該供應商是否原生支援「web_search_preview」工具。
 * 目前只有 OpenAI Responses API 提供；其他相容端點都不支援。
 */
export function supportsBuiltInWebSearch(provider: AiProvider): boolean {
  return provider === "openai";
}

/** 全站預設用的 client（沿用舊呼叫點） */
export function createAiClient(): OpenAI {
  return createAiClientFor(getAiProvider());
}

/** 指定供應商建一支 client（多供應商情境用） */
export function createAiClientFor(provider: AiProvider): OpenAI {
  const apiKey = getAiProviderApiKey(provider) || "mock-key";
  const baseURL = getAiProviderBaseUrl(provider);
  return new OpenAI({ apiKey, baseURL });
}

/**
 * 用「指定的 key」建立 client（給 admin UI「測試這把 key 是否有效」用，
 * 不會用到也不該用到 process.env 裡儲存的 key）。
 */
export function createAiClientWithKey(provider: AiProvider, apiKey: string): OpenAI {
  const baseURL = getAiProviderBaseUrl(provider);
  return new OpenAI({ apiKey, baseURL });
}

/** 顯示名稱（給 UI 下拉用，從 catalog 即時讀） */
export const AI_PROVIDER_DISPLAY: Record<AiProvider, string> = Object.fromEntries(
  PROVIDER_CATALOG.map((p) => [p.id, p.displayName])
) as Record<AiProvider, string>;
