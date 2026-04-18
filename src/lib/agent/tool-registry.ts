/**
 * AI Agent 工具註冊表
 * 管理所有可供 Agent 呼叫的工具，將工具定義轉為 OpenAI function calling 格式。
 */
import "server-only";

import type { AgentToolExecutor, AgentToolDefinition } from "./types";

const registry = new Map<string, AgentToolExecutor>();

export function registerTool(tool: AgentToolExecutor): void {
  registry.set(tool.definition.name, tool);
}

export function getTool(name: string): AgentToolExecutor | undefined {
  return registry.get(name);
}

export function getAllTools(): AgentToolExecutor[] {
  return Array.from(registry.values());
}

export function getToolDefinitions(): AgentToolDefinition[] {
  return getAllTools().map((t) => t.definition);
}

/**
 * 將註冊的工具轉為 OpenAI chat.completions 的 tools 參數格式
 */
export function toOpenAiFunctions(): Array<{
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return getAllTools().map((t) => ({
    type: "function" as const,
    function: {
      name: t.definition.name,
      description: t.definition.description,
      parameters: t.definition.parameters,
    },
  }));
}
