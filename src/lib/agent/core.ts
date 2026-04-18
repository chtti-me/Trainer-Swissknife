/**
 * AI Agent 核心引擎（v4）
 * ReAct 模式：推理 → 呼叫工具 → 觀察結果 → 回覆使用者
 * 支援串流回覆（SSE）與多輪工具呼叫。
 * OpenAI 模式：原生串流 + function calling
 * Gemini 模式：非串流 + function calling，回應後模擬逐段送出
 */
import "server-only";

import {
  createAiClient,
  getAiProvider,
  getDefaultModel,
  hasConfiguredAiApiKey,
  type AiProvider,
} from "@/lib/ai-provider";
import { prisma } from "@/lib/prisma";
import { ensureToolsRegistered } from "./tools";
import { getTool, toOpenAiFunctions } from "./tool-registry";
import { buildSystemPrompt, buildAgentContext } from "./context";
import { loadCustomTools } from "./tools/custom-tool-runner";
import {
  createConversation,
  getConversation,
  addMessage,
  loadHistory,
  updateConversationTitle,
} from "./history";
import type {
  AgentStreamChunk,
  AgentToolCallRecord,
  AgentExecutionContext,
} from "./types";
import { AGENT_MAX_TOOL_ROUNDS } from "./types";

ensureToolsRegistered();

interface RunAgentParams {
  userId: string;
  conversationId?: string;
  userMessage: string;
  imageUrls?: string[];
}

interface RunAgentResult {
  conversationId: string;
  stream: ReadableStream<Uint8Array>;
}

export async function runAgent(params: RunAgentParams): Promise<RunAgentResult> {
  const { userId, userMessage, imageUrls } = params;

  let conversationId = params.conversationId;
  if (conversationId) {
    const existing = await getConversation(conversationId, userId);
    if (!existing) {
      conversationId = undefined;
    }
  }

  if (!conversationId) {
    const conv = await createConversation(userId, summarizeTitle(userMessage));
    conversationId = conv.id;
  }

  await addMessage(conversationId, "user", userMessage);

  const ctx = await buildAgentContext(userId, conversationId);
  const systemPrompt = buildSystemPrompt(ctx.rules, ctx.skillAppend);

  const userCustomTools = await loadCustomTools(userId);
  const stream = createAgentStream(conversationId, systemPrompt, ctx, userCustomTools, imageUrls);

  return { conversationId, stream };
}

function summarizeTitle(message: string): string {
  const first = message.split("\n")[0]?.trim() || "新對話";
  return first.length > 30 ? first.slice(0, 30) + "…" : first;
}

// ---- 型別 ----

type ChatMessageContent =
  | string
  | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

type ChatMessage = { role: "system" | "user" | "assistant"; content: ChatMessageContent };

interface LlmCallResult {
  text: string;
  toolCalls: Array<{ name: string; args: string }>;
}

// ---- LLM 呼叫策略：依供應商分流 ----

async function callLlmStreaming(
  client: ReturnType<typeof createAiClient>,
  model: string,
  messages: ChatMessage[],
  tools: ReturnType<typeof toOpenAiFunctions>,
  send: (chunk: AgentStreamChunk) => void,
  conversationId: string
): Promise<LlmCallResult> {
  const response = await client.chat.completions.create({
    model,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: messages as any,
    tools: tools.length > 0 ? tools : undefined,
    temperature: 0.3,
    stream: true,
  });

  let text = "";
  const toolCallBuffers = new Map<number, { name: string; args: string }>();

  for await (const chunk of response) {
    const delta = chunk.choices[0]?.delta;
    if (!delta) continue;

    if (delta.content) {
      text += delta.content;
      send({ type: "text_delta", content: delta.content, conversationId });
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index;
        if (!toolCallBuffers.has(idx)) {
          toolCallBuffers.set(idx, { name: "", args: "" });
        }
        const buf = toolCallBuffers.get(idx)!;
        if (tc.function?.name) buf.name += tc.function.name;
        if (tc.function?.arguments) buf.args += tc.function.arguments;
      }
    }

    if (chunk.choices[0]?.finish_reason === "stop") break;
  }

  return {
    text,
    toolCalls: Array.from(toolCallBuffers.values()),
  };
}

async function callLlmNonStreaming(
  client: ReturnType<typeof createAiClient>,
  model: string,
  messages: ChatMessage[],
  tools: ReturnType<typeof toOpenAiFunctions>,
  send: (chunk: AgentStreamChunk) => void,
  conversationId: string
): Promise<LlmCallResult> {
  const response = await client.chat.completions.create({
    model,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: messages as any,
    tools: tools.length > 0 ? tools : undefined,
    temperature: 0.3,
  });

  const choice = response.choices[0];
  const text = choice?.message?.content || "";
  const rawToolCalls = choice?.message?.tool_calls || [];

  // 模擬串流：將文字分段送出
  if (text) {
    const chunkSize = 20;
    for (let i = 0; i < text.length; i += chunkSize) {
      send({ type: "text_delta", content: text.slice(i, i + chunkSize), conversationId });
    }
  }

  return {
    text,
    toolCalls: rawToolCalls.map((tc) => ({
      name: tc.function?.name || "",
      args: tc.function?.arguments || "{}",
    })),
  };
}

function pickLlmStrategy(provider: AiProvider) {
  // Gemini OpenAI-compatible 端點的串流 + function calling 組合不穩定，改用非串流
  return provider === "gemini" ? callLlmNonStreaming : callLlmStreaming;
}

// ---- 主串流迴圈 ----

function createAgentStream(
  conversationId: string,
  systemPrompt: string,
  ctx: AgentExecutionContext,
  customTools: Awaited<ReturnType<typeof loadCustomTools>> = [],
  imageUrls?: string[]
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      function send(chunk: AgentStreamChunk) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      }

      try {
        if (!hasConfiguredAiApiKey()) {
          const fallback = "目前尚未設定 AI API Key，請在 `.env` 檔案中設定 `OPENAI_API_KEY` 或 `GEMINI_API_KEY` 後重新啟動伺服器。";
          send({ type: "text_delta", content: fallback, conversationId });
          await addMessage(conversationId, "assistant", fallback);
          send({ type: "done", conversationId });
          controller.close();
          return;
        }

        const client = createAiClient();
        const provider = getAiProvider();
        const model = getDefaultModel(provider);
        const callLlm = pickLlmStrategy(provider);

        const builtinTools = toOpenAiFunctions();
        const customToolDefs = customTools.map((ct) => ({
          type: "function" as const,
          function: {
            name: ct.definition.name,
            description: ct.definition.description,
            parameters: ct.definition.parameters,
          },
        }));
        const tools = [...builtinTools, ...customToolDefs];

        const customToolMap = new Map(customTools.map((ct) => [ct.definition.name, ct]));

        const history = await loadHistory(conversationId);
        const messages: ChatMessage[] = [
          { role: "system", content: systemPrompt },
          ...history,
        ];

        if (imageUrls && imageUrls.length > 0 && messages.length > 0) {
          const lastMsg = messages[messages.length - 1];
          if (lastMsg.role === "user" && typeof lastMsg.content === "string") {
            const multiContent: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
              { type: "text", text: lastMsg.content },
              ...imageUrls.map((url) => ({
                type: "image_url" as const,
                image_url: { url },
              })),
            ];
            lastMsg.content = multiContent;
          }
        }

        let toolRounds = 0;
        let finalText = "";
        let lastToolSummary = "";

        while (toolRounds <= AGENT_MAX_TOOL_ROUNDS) {
          const llmResult = await callLlm(client, model, messages, tools, send, conversationId);

          if (llmResult.toolCalls.length === 0) {
            finalText = llmResult.text;
            break;
          }

          finalText = llmResult.text;
          toolRounds++;

          const toolResults: AgentToolCallRecord[] = [];

          for (const tc of llmResult.toolCalls) {
            const toolName = tc.name;
            const tool = getTool(toolName) || customToolMap.get(toolName);

            send({ type: "tool_start", toolName, conversationId });
            send({ type: "tool_progress", toolName, conversationId, progress: 0, content: `正在執行 ${toolName}...` });

            if (!tool) {
              const errorResult = { success: false, error: `未知工具：${toolName}` };
              send({ type: "tool_end", toolName, toolResult: errorResult, conversationId });
              toolResults.push({
                toolName,
                params: {},
                result: errorResult,
                durationMs: 0,
                status: "error",
              });
              continue;
            }

            let params: Record<string, unknown> = {};
            try {
              params = JSON.parse(tc.args || "{}");
            } catch {
              params = {};
            }

            const start = Date.now();
            send({ type: "tool_progress", toolName, conversationId, progress: 50, content: `${toolName} 處理中...` });
            const result = await tool.execute(params, ctx);
            const durationMs = Date.now() - start;
            send({ type: "tool_progress", toolName, conversationId, progress: 100, content: `${toolName} 完成（${durationMs}ms）` });

            send({
              type: "tool_end",
              toolName,
              toolParams: params,
              toolResult: result,
              conversationId,
            });

            toolResults.push({
              toolName,
              params,
              result: result.data ?? result.error,
              durationMs,
              status: result.success ? "success" : "error",
            });

            prisma.auditLog.create({
              data: {
                userId: ctx.userId,
                action: `agent_tool:${toolName}`,
                target: toolName,
                detail: JSON.stringify({ params, durationMs, success: result.success }).slice(0, 4000),
                agentConversationId: conversationId,
              },
            }).catch(() => {});
          }

          if (llmResult.text) {
            await addMessage(conversationId, "assistant", llmResult.text, toolResults);
          }

          lastToolSummary = toolResults
            .map((tr) => `工具 ${tr.toolName} 結果：${JSON.stringify(tr.result).slice(0, 3000)}`)
            .join("\n\n");

          messages.push({
            role: "assistant",
            content: llmResult.text || `（呼叫了工具：${toolResults.map((r) => r.toolName).join(", ")}）`,
          });
          messages.push({
            role: "user",
            content: `以下是工具執行結果，請根據結果回覆使用者：\n\n${lastToolSummary}`,
          });
        }

        if (!finalText && toolRounds > 0 && lastToolSummary) {
          finalText = `工具已執行完成。以下是查詢結果：\n\n${lastToolSummary}`;
          send({ type: "text_delta", content: finalText, conversationId });
        }

        if (finalText) {
          await addMessage(conversationId, "assistant", finalText);
        }

        if (toolRounds === 0 && finalText) {
          const titleSnippet = finalText.slice(0, 50).split("\n")[0] || "對話";
          await updateConversationTitle(
            conversationId,
            titleSnippet.length > 30 ? titleSnippet.slice(0, 30) + "…" : titleSnippet
          ).catch(() => {});
        }

        send({ type: "done", conversationId });
      } catch (e) {
        send({ type: "error", content: `Agent 執行錯誤：${(e as Error).message}`, conversationId });
      } finally {
        controller.close();
      }
    },
  });
}
