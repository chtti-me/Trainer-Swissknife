/**
 * AI Agent 平台 - 型別定義（v4）
 */

// ---- 對話相關 ----

export interface AgentChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: AgentToolCallRecord[];
  createdAt: string;
}

export interface AgentConversationSummary {
  id: string;
  title: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

// ---- 工具系統 ----

export interface AgentToolCallRecord {
  toolName: string;
  params: Record<string, unknown>;
  result: unknown;
  durationMs: number;
  status: "success" | "error" | "pending_confirmation";
}

export interface AgentToolDefinition {
  name: string;
  /** 給 LLM 看的功能描述（繁體中文） */
  description: string;
  /** JSON Schema 參數定義 */
  parameters: Record<string, unknown>;
  /** 是否需要使用者確認才能執行 */
  requiresConfirmation?: boolean;
}

export interface AgentToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface AgentToolExecutor {
  definition: AgentToolDefinition;
  execute(
    params: Record<string, unknown>,
    ctx: AgentExecutionContext
  ): Promise<AgentToolResult>;
}

// ---- 規則系統 ----

export interface AgentRule {
  id: string;
  slug: string;
  title: string;
  content: string;
  scope: "global" | "user";
  isActive: boolean;
  priority: number;
}

// ---- 執行脈絡 ----

export interface AgentExecutionContext {
  userId: string;
  conversationId: string;
  rules: AgentRule[];
  skillAppend: string;
}

// ---- API 請求／回應 ----

export interface AgentChatRequest {
  conversationId?: string;
  message: string;
  /** 圖片 URL 陣列（使用者透過工作區上傳後取得） */
  imageUrls?: string[];
}

export interface AgentChatResponse {
  conversationId: string;
  message: AgentChatMessage;
}

export interface AgentStreamChunk {
  type: "text_delta" | "tool_start" | "tool_progress" | "tool_end" | "done" | "error";
  content?: string;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  toolResult?: AgentToolResult;
  conversationId?: string;
  messageId?: string;
  progress?: number;
}

// ---- 設定 ----

export const AGENT_MAX_TOOL_ROUNDS = 8;
export const AGENT_MAX_HISTORY_MESSAGES = 20;
