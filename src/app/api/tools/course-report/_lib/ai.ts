/**
 * 【課程規劃報告產生器 - 共用 server-side AI helper】
 *
 * 統一處理 OpenAI-compatible 的 chat.completions（用瑞士刀 createAiClient），
 * 並支援 `response_format: json_schema`（失敗自動 fallback 到 `json_object`）。
 *
 * 目的是讓 ai/extract、ai/optimize-text、ai/find-highlights、ai/chart
 * 等 route 都用同一份程式做 AI 呼叫，不要每個 route 抄一次。
 */
import "server-only";
import {
  createAiClient,
  getAiProviderFor,
  getModelFor,
  type AiProvider,
} from "@/lib/ai-provider";
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
  const provider = req.provider ?? getAiProviderFor("course_report");
  const model = req.model ?? getModelFor("course_report", provider);
  const client = createAiClient();

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: req.systemInstruction },
    { role: "user", content: userToContent(req.user) },
  ];

  const baseParams = {
    model,
    messages,
    temperature: typeof req.temperature === "number" ? req.temperature : 0.5,
  };

  let text = "";
  try {
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
        text = resp.choices[0]?.message?.content || "";
      } catch (jsonSchemaErr) {
        console.warn(
          "[course-report ai] json_schema 模式失敗，回退至 json_object：",
          jsonSchemaErr
        );
        const resp = await client.chat.completions.create({
          ...baseParams,
          response_format: { type: "json_object" },
        });
        text = resp.choices[0]?.message?.content || "";
      }
    } else {
      const resp = await client.chat.completions.create(baseParams);
      text = resp.choices[0]?.message?.content || "";
    }
  } catch (err) {
    console.error("[course-report ai] 失敗：", err);
    const message = err instanceof Error ? err.message : "未知錯誤";
    throw new Error(`AI 呼叫失敗：${message}`);
  }

  return { text, model, provider };
}

/** 安全 JSON parse；失敗時 throw 帶 raw 字串的錯誤訊息 */
export function safeJsonParse<T>(raw: string): T {
  // 試著抽出 markdown code fence 中的 JSON
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : raw.trim();
  try {
    return JSON.parse(candidate) as T;
  } catch (err) {
    throw new Error(
      `AI 回應無法解析為 JSON：${err instanceof Error ? err.message : "?"}\n--- raw ---\n${raw.slice(0, 500)}`
    );
  }
}
