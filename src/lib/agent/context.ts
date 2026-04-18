/**
 * Agent 脈絡組裝器
 * 將 Rules（行為規則）+ Skills（AI 技能脈絡）組裝成 System Prompt。
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { buildAiSkillPromptAppend } from "@/lib/ai-skills";
import { getToolDefinitions } from "./tool-registry";
import type { AgentRule, AgentExecutionContext } from "./types";

const BASE_SYSTEM_PROMPT = `你是「培訓師瑞士刀」的 AI 助理，代號「小瑞」。你具備多種工具能力，能協助中華電信學院的培訓師完成各種工作。

## 你的能力
- 課程規劃：根據培訓需求產出開班計劃表（建議班名、目標、對象、課程模組、講師建議）
- 班次查詢：搜尋系統中的開班資料與培訓師名冊（db_query）
- 語義搜尋：用自然語言描述想找的課程，AI 自動比對語義最相關的班次（semantic_search）
- 相似度檢測：比對班次找出可能重複的課程
- 網路搜尋：查詢即時資訊（講師資料、最新技術趨勢等）
- 檔案操作：在工作區讀寫檔案，使用者可上傳檔案，你可以產生檔案供使用者下載
- 知識庫查詢：在使用者上傳的文件中做語義搜尋（knowledge_query）
- 長期記憶：記住使用者的偏好和重要資訊，跨對話持久化（memory_save / memory_recall）
- 工作流程：一鍵執行複雜彙整任務（週報、月統計、我的課程、待辦提醒）
- 每日簡報：快速掌握今日與明日的工作狀況（daily_briefing）
- 師資推薦：根據課程主題搜尋合適講師，整合「個人師資人脈」、「培訓師名冊」、「歷史授課紀錄」三大來源（instructor_search），還可搭配 web_search 搜尋外部講師
- 腳本執行：執行系統預定義的安全腳本
- 圖片分析：使用者上傳圖片時，你可以分析圖片內容

## 行為準則
1. 所有回覆使用繁體中文
2. 先理解使用者意圖，再決定是否需要呼叫工具
3. 一次對話中可多次呼叫工具，逐步完成複雜任務
4. 呼叫工具前，簡短說明你要做什麼
5. 工具執行結果要用易懂的方式整理給使用者，善用 Markdown 表格、清單、標題來組織內容
6. 不捏造未經工具查證的具體事實（日期、人名、系統狀態）
7. 遇到不確定的問題，誠實說明並建議下一步
8. 當使用者表達偏好或重要資訊時，主動詢問是否要用 memory_save 記住
9. 當使用者寫入檔案時，務必在回覆中附上下載連結
10. 當使用者詢問師資推薦時，**務必**先使用 instructor_search 工具搜尋系統內的三大來源（個人師資人脈、培訓師名冊、歷史授課紀錄），整理結果後再視需要用 web_search 補充外部資訊`;

/**
 * 從資料庫載入使用者適用的 Agent 規則
 */
export async function loadActiveRules(userId: string): Promise<AgentRule[]> {
  const rows = await prisma.agentRule.findMany({
    where: {
      isActive: true,
      OR: [
        { scope: "global" },
        { scope: "user", createdBy: userId },
      ],
    },
    orderBy: [{ priority: "desc" }, { slug: "asc" }],
  });

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    content: r.content,
    scope: r.scope as "global" | "user",
    isActive: r.isActive,
    priority: r.priority,
  }));
}

/**
 * 組裝完整 system prompt
 */
export function buildSystemPrompt(rules: AgentRule[], skillAppend: string): string {
  const parts = [BASE_SYSTEM_PROMPT];

  if (rules.length > 0) {
    parts.push("\n## Agent 規則（必須遵守）");
    for (const rule of rules) {
      parts.push(`- 【${rule.title}】${rule.content}`);
    }
  }

  const tools = getToolDefinitions();
  if (tools.length > 0) {
    parts.push("\n## 可用工具清單");
    for (const tool of tools) {
      parts.push(`- \`${tool.name}\`：${tool.description}`);
    }
  }

  if (skillAppend.trim()) {
    parts.push(skillAppend);
  }

  return parts.join("\n");
}

/**
 * 載入使用者的長期記憶，附加到 system prompt 中
 */
async function loadUserMemories(userId: string): Promise<string> {
  try {
    const memories = await prisma.classNote.findMany({
      where: {
        userId,
        classId: null,
        content: { startsWith: "[小瑞記憶]" },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    if (memories.length === 0) return "";

    const lines = memories.map((m) =>
      m.content.replace("[小瑞記憶]", "").trim()
    );
    return `\n\n## 使用者的長期記憶（你之前記住的資訊）\n${lines.map((l) => `- ${l}`).join("\n")}`;
  } catch {
    return "";
  }
}

/**
 * 建立完整的 Agent 執行脈絡
 */
export async function buildAgentContext(
  userId: string,
  conversationId: string
): Promise<AgentExecutionContext> {
  const [rules, skillAppend, memoryAppend] = await Promise.all([
    loadActiveRules(userId),
    buildAiSkillPromptAppend(userId),
    loadUserMemories(userId),
  ]);

  return {
    userId,
    conversationId,
    rules,
    skillAppend: skillAppend + memoryAppend,
  };
}
