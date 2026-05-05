import "server-only";
import OpenAI from "openai";

// 支援的 AI 供應商。三家都用 OpenAI-compatible chat/completions 介面。
export type AiProvider = "openai" | "gemini" | "groq";

const VALID_PROVIDERS: readonly AiProvider[] = ["openai", "gemini", "groq"];

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

export function getAiProviderApiKey(provider: AiProvider): string {
  if (provider === "gemini") {
    return process.env.GEMINI_API_KEY?.trim() || "";
  }
  if (provider === "groq") {
    return process.env.GROQ_API_KEY?.trim() || "";
  }
  return process.env.OPENAI_API_KEY?.trim() || "";
}

function getAiProviderBaseUrl(provider: AiProvider): string {
  if (provider === "gemini") {
    return (
      process.env.GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta/openai"
    );
  }
  if (provider === "groq") {
    return process.env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1";
  }
  return process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
}

/** 該供應商的 「全功能 fallback 預設模型」（沒有特別指定功能模型時用這個） */
export function getDefaultModel(provider: AiProvider): string {
  if (provider === "gemini") {
    return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  }
  if (provider === "groq") {
    return process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
  }
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

/**
 * 課程規劃幫手專用模型解析（沿用舊名）。
 * 解析序：`{PROVIDER}_MODEL_PLANNING` → `getDefaultModel(provider)`
 */
export function getPlanningModel(provider: AiProvider): string {
  if (provider === "gemini") {
    return process.env.GEMINI_MODEL_PLANNING?.trim() || getDefaultModel(provider);
  }
  if (provider === "groq") {
    return process.env.GROQ_MODEL_PLANNING?.trim() || getDefaultModel(provider);
  }
  return process.env.OPENAI_MODEL_PLANNING?.trim() || getDefaultModel(provider);
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
 * 目前只有 OpenAI Responses API 提供；Gemini OpenAI-compat、Groq 都不支援。
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

/** 顯示名稱（給 UI 下拉用） */
export const AI_PROVIDER_DISPLAY: Record<AiProvider, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  groq: "Groq",
};
