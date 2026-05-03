/**
 * 【EDM Generator AI Text Proxy】
 *
 * 接收 EDM Generator 客戶端 `trainerAcademyAiAdapter.generateText(opts)` 的請求，
 * 透過瑞士刀現成的 `createAiClient()`（OpenAI-compatible，自動依 AI_PROVIDER
 * 切換 OpenAI / Gemini）轉呼叫，返回 `{ text, model }`。
 *
 * 翻譯重點：
 *   - `systemInstruction` → messages[0] 的 system role
 *   - `user`：字串直接傳；陣列形式翻成 OpenAI 多模態 content parts
 *     （`text` 與 `image_url`，後者吃 data URL）
 *   - `responseSchema`：盡可能用 `response_format: { type: 'json_schema' }`，
 *     若 provider 不支援則 fallback 到 `json_object` 模式，仍可拿到 JSON 字串。
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createAiClient, getAiProvider, getDefaultModel } from "@/lib/ai-provider";
import type {
  AiGenerateTextOpts,
  AiGenerateTextResult,
  AiUserPart,
  AiJsonSchema,
} from "@edm/lib/ai/adapter";
import type { ChatCompletionContentPart, ChatCompletionMessageParam } from "openai/resources/chat/completions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function userPartsToOpenAi(
  user: AiGenerateTextOpts["user"]
): string | ChatCompletionContentPart[] {
  if (typeof user === "string") return user;
  const parts: ChatCompletionContentPart[] = (user as AiUserPart[]).map((p) => {
    if (p.kind === "text") {
      return { type: "text", text: p.text };
    }
    return {
      type: "image_url",
      image_url: { url: `data:${p.mimeType};base64,${p.base64}` },
    };
  });
  return parts;
}

/**
 * EDM Generator 用的 AiJsonSchema（type 為小寫字串）已是 JSON-Schema-spec 的子集，
 * 直接餵給 OpenAI 的 `response_format.json_schema.schema` 即可。
 * `additionalProperties: false` 為 OpenAI strict 模式必要欄位（遞迴補上）。
 */
function preparesSchemaForOpenAi(schema: AiJsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = { type: schema.type };
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = schema.enum;
  if (schema.properties) {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      props[k] = preparesSchemaForOpenAi(v);
    }
    out.properties = props;
  }
  if (schema.type === "object") {
    out.additionalProperties = false;
    if (schema.required) {
      out.required = schema.required;
    } else if (schema.properties) {
      out.required = Object.keys(schema.properties);
    }
  }
  if (schema.items) out.items = preparesSchemaForOpenAi(schema.items);
  return out;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  let opts: AiGenerateTextOpts;
  try {
    opts = (await req.json()) as AiGenerateTextOpts;
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const provider = getAiProvider();
  const model = opts.model || getDefaultModel(provider);
  const client = createAiClient();

  const messages: ChatCompletionMessageParam[] = [];
  if (opts.systemInstruction) {
    messages.push({ role: "system", content: opts.systemInstruction });
  }
  const userContent = userPartsToOpenAi(opts.user);
  messages.push({ role: "user", content: userContent });

  // response_format：先嘗試 json_schema，失敗再退回 json_object（純結構化 JSON 字串）
  const baseParams = {
    model,
    messages,
    temperature: typeof opts.temperature === "number" ? opts.temperature : undefined,
  };

  let text = "";
  try {
    if (opts.responseSchema) {
      try {
        const schema = preparesSchemaForOpenAi(opts.responseSchema);
        const resp = await client.chat.completions.create({
          ...baseParams,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "edm_response",
              schema,
              strict: false,
            },
          },
        });
        text = resp.choices[0]?.message?.content || "";
      } catch (jsonSchemaErr) {
        console.warn(
          "[EDM ai/text] json_schema 模式失敗，回退至 json_object：",
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
    console.error("[EDM ai/text] 失敗：", err);
    const message = err instanceof Error ? err.message : "未知錯誤";
    return NextResponse.json({ error: `AI 文字生成失敗：${message}` }, { status: 500 });
  }

  const result: AiGenerateTextResult = { text, model };
  return NextResponse.json(result);
}
