/**
 * Agent 對話歷史管理
 * 讀寫 AgentConversation + AgentMessage，並轉為 OpenAI messages 格式。
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import type { AgentChatMessage, AgentToolCallRecord } from "./types";
import { AGENT_MAX_HISTORY_MESSAGES } from "./types";

/**
 * 建立新對話
 */
export async function createConversation(userId: string, title?: string) {
  return prisma.agentConversation.create({
    data: {
      userId,
      title: title || "新對話",
    },
  });
}

/**
 * 取得單一對話（含驗證擁有者）
 */
export async function getConversation(conversationId: string, userId: string) {
  return prisma.agentConversation.findFirst({
    where: { id: conversationId, userId },
  });
}

/**
 * 更新對話標題
 */
export async function updateConversationTitle(conversationId: string, title: string) {
  return prisma.agentConversation.update({
    where: { id: conversationId },
    data: { title },
  });
}

/**
 * 列出使用者的所有對話（最新排前）
 */
export async function listConversations(userId: string, limit = 50) {
  const conversations = await prisma.agentConversation.findMany({
    where: { userId, status: "active" },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      _count: { select: { messages: true } },
    },
  });

  return conversations.map((c) => ({
    id: c.id,
    title: c.title,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    messageCount: c._count.messages,
  }));
}

/**
 * 新增訊息到對話
 */
export async function addMessage(
  conversationId: string,
  role: "user" | "assistant" | "tool",
  content: string,
  toolCalls?: AgentToolCallRecord[]
): Promise<AgentChatMessage> {
  const msg = await prisma.agentMessage.create({
    data: {
      conversationId,
      role,
      content,
      toolCalls: toolCalls ? JSON.stringify(toolCalls) : null,
    },
  });

  // touch conversation
  await prisma.agentConversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return {
    id: msg.id,
    role: msg.role as "user" | "assistant" | "tool",
    content: msg.content,
    toolCalls: toolCalls ?? undefined,
    createdAt: msg.createdAt.toISOString(),
  };
}

/**
 * 滑動窗口大小：超過此數量的訊息，舊的部分會被壓縮為摘要
 */
const WINDOW_SIZE = 16;
const SUMMARY_KEEP = 4;

/**
 * 載入對話歷史（滑動窗口）
 * 若訊息超過窗口，將較早的訊息壓縮為一句摘要，保留最近的訊息
 */
export async function loadHistory(conversationId: string): Promise<
  Array<{ role: "user" | "assistant" | "system"; content: string }>
> {
  const messages = await prisma.agentMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: AGENT_MAX_HISTORY_MESSAGES,
  });

  const filtered = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  if (filtered.length <= WINDOW_SIZE) return filtered;

  const oldMessages = filtered.slice(0, filtered.length - WINDOW_SIZE + SUMMARY_KEEP);
  const recentMessages = filtered.slice(filtered.length - WINDOW_SIZE + SUMMARY_KEEP);

  const summaryLines = oldMessages.map((m) => {
    const prefix = m.role === "user" ? "使用者" : "助理";
    const snippet = m.content.length > 80 ? m.content.slice(0, 80) + "…" : m.content;
    return `- ${prefix}：${snippet}`;
  });

  const summaryMsg = {
    role: "system" as const,
    content: `以下是此對話先前內容的摘要（共 ${oldMessages.length} 則訊息）：\n${summaryLines.join("\n")}`,
  };

  return [summaryMsg as { role: "user" | "assistant" | "system"; content: string }, ...recentMessages];
}

/**
 * 載入對話所有訊息（給前端用）
 */
export async function loadAllMessages(conversationId: string): Promise<AgentChatMessage[]> {
  const messages = await prisma.agentMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  return messages.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant" | "tool",
    content: m.content,
    toolCalls: m.toolCalls ? (JSON.parse(m.toolCalls) as AgentToolCallRecord[]) : undefined,
    createdAt: m.createdAt.toISOString(),
  }));
}

/**
 * 封存對話
 */
export async function archiveConversation(conversationId: string) {
  return prisma.agentConversation.update({
    where: { id: conversationId },
    data: { status: "archived" },
  });
}

/**
 * 刪除對話（硬刪除）
 */
export async function deleteConversation(conversationId: string) {
  return prisma.agentConversation.delete({
    where: { id: conversationId },
  });
}
