/**
 * 自定義工具執行引擎
 * 在 Agent 執行時動態載入使用者的 CustomTool，以 HTTP POST 呼叫外部端點。
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  AgentToolExecutor,
  AgentToolDefinition,
  AgentToolResult,
  AgentExecutionContext,
} from "../types";

const CUSTOM_TOOL_TIMEOUT_MS = 15_000;

export async function loadCustomTools(
  userId: string
): Promise<AgentToolExecutor[]> {
  const tools = await prisma.customTool.findMany({
    where: { userId, isActive: true },
  });

  return tools.map((t) => {
    let parsedSchema: Record<string, unknown> = {};
    try {
      parsedSchema = JSON.parse(t.inputSchema);
    } catch {
      parsedSchema = { type: "object", properties: {} };
    }

    let parsedHeaders: Record<string, string> = {};
    if (t.headers) {
      try {
        parsedHeaders = JSON.parse(t.headers);
      } catch {
        parsedHeaders = {};
      }
    }

    const definition: AgentToolDefinition = {
      name: `custom_${t.name}`,
      description: `[自定義] ${t.description}`,
      parameters: parsedSchema,
    };

    const execute = async (
      params: Record<string, unknown>,
      _ctx: AgentExecutionContext
    ): Promise<AgentToolResult> => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          CUSTOM_TOOL_TIMEOUT_MS
        );

        const res = await fetch(t.endpointUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...parsedHeaders,
          },
          body: JSON.stringify(params),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          return {
            success: false,
            error: `端點回傳 ${res.status}：${errText.slice(0, 500)}`,
          };
        }

        const data = await res.json().catch(() => res.text());
        return { success: true, data };
      } catch (e) {
        const message =
          e instanceof Error && e.name === "AbortError"
            ? `呼叫逾時（${CUSTOM_TOOL_TIMEOUT_MS}ms）`
            : (e as Error).message;
        return { success: false, error: message };
      }
    };

    return { definition, execute };
  });
}
