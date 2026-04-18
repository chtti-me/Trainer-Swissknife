/**
 * Agent 工具：長期記憶
 * 讓小瑞記住使用者的偏好、常用資訊，跨對話持久化。
 * 記憶存在 DB（ClassNote 模型，classId=null + 特殊 prefix）。
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import type { AgentToolExecutor, AgentToolResult, AgentExecutionContext } from "../types";

const MEMORY_PREFIX = "[小瑞記憶]";

const memorySaveDef = {
  name: "memory_save",
  description:
    "將重要資訊儲存到長期記憶中，下次對話時也能記得。適合記錄使用者偏好、常用資訊、工作備忘等。例如：「使用者負責雲端系列課程」、「使用者偏好在週三開課」。",
  parameters: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "要記住的資訊內容",
      },
      category: {
        type: "string",
        description: "分類標籤（選填），例如：偏好、工作備忘、講師資訊",
      },
    },
    required: ["content"],
  },
} as const;

async function memorySaveExec(
  params: Record<string, unknown>,
  ctx: AgentExecutionContext
): Promise<AgentToolResult> {
  try {
    const content = String(params.content || "").trim();
    if (!content) return { success: false, error: "記憶內容不可為空" };

    const category = String(params.category || "一般").trim();
    const fullContent = `${MEMORY_PREFIX} [${category}] ${content}`;

    await prisma.classNote.create({
      data: {
        classId: null,
        userId: ctx.userId,
        content: fullContent,
        importance: "normal",
      },
    });

    return { success: true, data: { message: `已記住：${content}` } };
  } catch (e) {
    return { success: false, error: `儲存記憶失敗：${(e as Error).message}` };
  }
}

export const memorySaveTool: AgentToolExecutor = {
  definition: memorySaveDef,
  execute: memorySaveExec,
};

const memoryRecallDef = {
  name: "memory_recall",
  description:
    "查詢長期記憶中儲存的資訊。可搜尋關鍵字，或列出所有記憶。適合回想使用者偏好、先前約定的事項。",
  parameters: {
    type: "object",
    properties: {
      keyword: {
        type: "string",
        description: "搜尋關鍵字（選填，留空則列出全部記憶）",
      },
    },
  },
} as const;

async function memoryRecallExec(
  params: Record<string, unknown>,
  ctx: AgentExecutionContext
): Promise<AgentToolResult> {
  try {
    const keyword = String(params.keyword || "").trim();

    const notes = await prisma.classNote.findMany({
      where: {
        userId: ctx.userId,
        classId: null,
        content: { startsWith: MEMORY_PREFIX },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    let results = notes.map((n) => ({
      id: n.id,
      content: n.content.replace(MEMORY_PREFIX, "").trim(),
      createdAt: n.createdAt.toISOString(),
    }));

    if (keyword) {
      results = results.filter((r) =>
        r.content.toLowerCase().includes(keyword.toLowerCase())
      );
    }

    return {
      success: true,
      data: {
        count: results.length,
        memories: results,
        message: results.length === 0
          ? "目前沒有相關的記憶"
          : `找到 ${results.length} 筆記憶`,
      },
    };
  } catch (e) {
    return { success: false, error: `讀取記憶失敗：${(e as Error).message}` };
  }
}

export const memoryRecallTool: AgentToolExecutor = {
  definition: memoryRecallDef,
  execute: memoryRecallExec,
};

const memoryDeleteDef = {
  name: "memory_delete",
  description: "刪除長期記憶中的某筆資訊。",
  parameters: {
    type: "object",
    properties: {
      memoryId: {
        type: "string",
        description: "要刪除的記憶 ID",
      },
    },
    required: ["memoryId"],
  },
} as const;

async function memoryDeleteExec(
  params: Record<string, unknown>,
  ctx: AgentExecutionContext
): Promise<AgentToolResult> {
  try {
    const memoryId = String(params.memoryId || "");
    const existing = await prisma.classNote.findFirst({
      where: { id: memoryId, userId: ctx.userId, content: { startsWith: MEMORY_PREFIX } },
    });
    if (!existing) return { success: false, error: "找不到該記憶" };

    await prisma.classNote.delete({ where: { id: memoryId } });
    return { success: true, data: { message: "記憶已刪除" } };
  } catch (e) {
    return { success: false, error: `刪除記憶失敗：${(e as Error).message}` };
  }
}

export const memoryDeleteTool: AgentToolExecutor = {
  definition: memoryDeleteDef,
  execute: memoryDeleteExec,
};
