import "server-only";
import OpenAI from "openai";

export type AiProvider = "openai" | "gemini";

function normalizeProvider(raw: string | undefined): AiProvider {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "gemini") return "gemini";
  return "openai";
}

export function getAiProvider(): AiProvider {
  return normalizeProvider(process.env.AI_PROVIDER);
}

export function getAiProviderApiKey(provider: AiProvider): string {
  if (provider === "gemini") {
    return process.env.GEMINI_API_KEY?.trim() || "";
  }
  return process.env.OPENAI_API_KEY?.trim() || "";
}

function getAiProviderBaseUrl(provider: AiProvider): string {
  if (provider === "gemini") {
    return process.env.GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta/openai";
  }
  return process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
}

export function getDefaultModel(provider: AiProvider): string {
  if (provider === "gemini") {
    return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  }
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

export function getPlanningModel(provider: AiProvider): string {
  if (provider === "gemini") {
    return process.env.GEMINI_MODEL_PLANNING?.trim() || getDefaultModel(provider);
  }
  return process.env.OPENAI_MODEL_PLANNING?.trim() || getDefaultModel(provider);
}

export function hasConfiguredAiApiKey(): boolean {
  return Boolean(getAiProviderApiKey(getAiProvider()));
}

export function supportsBuiltInWebSearch(provider: AiProvider): boolean {
  // 目前專案使用 OpenAI Responses 的 web_search_preview 工具；
  // Gemini 走 OpenAI-compatible chat 模式時未保證支援該工具。
  return provider === "openai";
}

export function createAiClient(): OpenAI {
  const provider = getAiProvider();
  const apiKey = getAiProviderApiKey(provider) || "mock-key";
  const baseURL = getAiProviderBaseUrl(provider);
  return new OpenAI({ apiKey, baseURL });
}

