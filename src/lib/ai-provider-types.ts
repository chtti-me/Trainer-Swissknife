/**
 * AI 供應商相關型別定義（pure types，無 server-only 依賴，client/server 共用）。
 *
 * 為什麼獨立檔案：
 *   src/lib/ai-provider.ts 是 server-only（內含 OpenAI client、process.env），
 *   client component 不能 import；UI 卻需要 AiProvider 型別與 catalog。
 *   把純型別 + catalog 拉出來放在不掛 server-only 的檔案裡。
 */

/**
 * 系統支援的所有 AI 供應商識別字。
 * 與 src/lib/ai-providers/catalog.ts 的 PROVIDER_CATALOG[*].id 必須一一對應。
 */
export type AiProvider = "openai" | "gemini" | "groq" | "nvidia" | "openrouter" | "xai";

export const VALID_PROVIDERS: readonly AiProvider[] = [
  "openai",
  "gemini",
  "groq",
  "nvidia",
  "openrouter",
  "xai",
] as const;

export function isAiProvider(v: unknown): v is AiProvider {
  return typeof v === "string" && (VALID_PROVIDERS as readonly string[]).includes(v);
}
