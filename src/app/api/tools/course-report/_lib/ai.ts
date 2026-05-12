/**
 * 【課程規劃報告產生器 - 共用 server-side AI helper】
 *
 * 統一處理 OpenAI-compatible 的 chat.completions，並走瑞士刀的 `callWithFallback`
 * 實現多 provider 自動切換（OpenRouter → Gemini → Groq）。
 *
 * 兩層 fallback：
 *   1. `response_format: json_schema` 失敗自動退到 `json_object`（同 provider 內，
 *      因為不同 provider 對 strict schema 支援不一）
 *   2. 整個 run 拿 400/402/413/429/5xx 由 callWithFallback 切到下一家 provider
 *
 * 目的是讓 ai/extract、ai/optimize-text、ai/find-highlights、ai/chart
 * 等 route 都用同一份程式做 AI 呼叫，不要每個 route 抄一次。
 */
import "server-only";
import {
  getAiProviderFor,
  type AiProvider,
} from "@/lib/ai-provider";
import { callWithFallback } from "@/lib/ai-providers/runtime";
import type { ChatCompletionContentPart, ChatCompletionMessageParam } from "openai/resources/chat/completions";

export interface AiTextRequest {
  systemInstruction: string;
  /** user 訊息可以是純字串，或多模態（text + image dataURL） */
  user:
    | string
    | Array<{ kind: "text"; text: string } | { kind: "image"; mimeType: string; base64: string }>;
  /** 若給，會嘗試 json_schema 模式 */
  responseSchema?: Record<string, unknown>;
  /** 預設 0.5 */
  temperature?: number;
  /** 強制指定模型；不傳則用 getModelFor('course_report', provider) */
  model?: string;
  /** 強制指定供應商；不傳則用 getAiProviderFor('course_report') */
  provider?: AiProvider;
}

export interface AiTextResult {
  text: string;
  model: string;
  provider: AiProvider;
}

function userToContent(user: AiTextRequest["user"]): string | ChatCompletionContentPart[] {
  if (typeof user === "string") return user;
  return user.map((p) => {
    if (p.kind === "text") return { type: "text" as const, text: p.text };
    return {
      type: "image_url" as const,
      image_url: { url: `data:${p.mimeType};base64,${p.base64}` },
    };
  });
}

export async function generateAiText(req: AiTextRequest): Promise<AiTextResult> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: req.systemInstruction },
    { role: "user", content: userToContent(req.user) },
  ];
  const preferredProvider = req.provider ?? getAiProviderFor("course_report");

  // 用 callWithFallback 包起來：任一 provider 拿 400/402/413/429/5xx 自動切下一家。
  // schema 模式的「json_schema → json_object」內部 fallback 在 run 內各 provider 跑一次（不算 provider 失敗）。
  try {
    const { value, provider: usedProvider } = await callWithFallback({
      feature: "course_report",
      explicitProvider: preferredProvider,
      run: async ({ client, model: ctxModel }) => {
        const useModel = req.model || ctxModel;
        const baseParams = {
          model: useModel,
          messages,
          temperature: typeof req.temperature === "number" ? req.temperature : 0.5,
        };
        if (req.responseSchema) {
          try {
            const resp = await client.chat.completions.create({
              ...baseParams,
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "course_report_response",
                  schema: req.responseSchema,
                  strict: false,
                },
              },
            });
            return { text: resp.choices[0]?.message?.content || "", usedModel: useModel };
          } catch (jsonSchemaErr) {
            console.warn(
              "[course-report ai] json_schema 模式失敗，回退至 json_object：",
              jsonSchemaErr
            );
            const resp = await client.chat.completions.create({
              ...baseParams,
              response_format: { type: "json_object" },
            });
            return { text: resp.choices[0]?.message?.content || "", usedModel: useModel };
          }
        }
        const resp = await client.chat.completions.create(baseParams);
        return { text: resp.choices[0]?.message?.content || "", usedModel: useModel };
      },
    });
    return { text: value.text, model: value.usedModel, provider: usedProvider };
  } catch (err) {
    console.error("[course-report ai] 失敗：", err);
    const message = err instanceof Error ? err.message : "未知錯誤";
    throw new Error(`AI 呼叫失敗：${message}`);
  }
}

/** 安全 JSON parse；失敗時 throw 帶 raw 字串的錯誤訊息 */
export function safeJsonParse<T>(raw: string): T {
  // 先試著抽出 markdown code fence 中的 JSON
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = extractJsonCandidate(fenceMatch ? fenceMatch[1].trim() : raw.trim());
  try {
    return JSON.parse(candidate) as T;
  } catch (err) {
    throw new Error(
      `AI 回應無法解析為 JSON：${err instanceof Error ? err.message : "?"}\n--- raw ---\n${raw.slice(0, 500)}`
    );
  }
}

function extractJsonCandidate(raw: string): string {
  const text = raw.trim();
  if (!text) return text;
  if (text.startsWith("{") || text.startsWith("[")) return text;

  const start = text.search(/[\{\[]/);
  if (start < 0) return text;

  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth++;
    if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return text.slice(start);
}
