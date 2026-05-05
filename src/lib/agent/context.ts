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
- 課程規劃：協助使用者把模糊需求談成完整的「開班計畫表」草案（course_plan 工具會建立規劃單並自動啟動 11 Skill 流水線）；查詢既有規劃進度（course_plan_status）
- 班次查詢：搜尋系統中的開班資料與培訓師名冊（db_query）
- 語義搜尋：用自然語言描述想找的課程，AI 自動比對語義最相關的班次（semantic_search）
- 相似度檢測：比對班次找出可能重複的課程
- 網路搜尋：查詢即時資訊（講師資料、最新技術趨勢等）
- 檔案操作：在工作區讀寫檔案，使用者可上傳檔案，你可以產生檔案供使用者下載
- 知識庫查詢：在使用者上傳的文件中做語義搜尋（knowledge_query）
- 長期記憶：記住使用者的偏好和重要資訊，跨對話持久化（memory_save / memory_recall）
- 工作流程：一鍵執行複雜彙整任務（週報、月統計、我的課程、待辦提醒）
- 每日簡報：快速掌握今日與明日的工作狀況（daily_briefing）
- 師資推薦：**必須併用** instructor_search（個人師資人脈、培訓師名冊、歷史授課紀錄）與 web_search（網路公開講師／師資資訊），不可只查系統內就結束
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
10. 當使用者意圖為尋找、推薦或詢問講師、師資、課程講者、授課人選（含特定領域如「某主題＋講師」）時，**必須**在產出給使用者的最終答案前，**先後或於同一輪**完成兩項工具呼叫，缺一不可：（1）instructor_search（搜尋個人師資人脈、培訓師名冊、歷史授課紀錄）；（2）web_search（以與主題相符的 query 上網搜尋公開講師或師資線索，必要時在 query 加上「講師」「師資」「企業培訓」等詞）。**禁止**僅執行 instructor_search、或未執行 web_search 就結束此類問題。若 web_search 因未設定 TAVILY_API_KEY 等原因失敗，應誠實告知，並仍完整整理 instructor_search 結果；不可憑空捏造網搜到的人名或機構。

## 課程規劃專用工作流程（呼叫 course_plan 工具前，必讀）

當使用者表達「規劃／設計／開一個 X 課程」、「幫我做開班計畫表」、「我想開一個給 Y 的課」等意圖時：

11. **不要直接呼叫 course_plan**。先檢查使用者敘述是否包含以下「規劃六要素」，缺哪幾項就友善地一次問完：
    - **訓練主題**（要教什麼，例：Python、AI 寫作、電信法規）
    - **訓練對象**（誰要上、人數規模、技術／資歷背景，例：「板橋院本部新進工程師約 20 人」）
    - **能力需求／痛點**（學員目前卡在哪、希望解決什麼問題）
    - **預期時數／天數**（例：6 小時、一天班、半天班、分 3 週每週 2 小時）
    - **形式偏好**（實體 / 線上直播 / 混成 / 自學；不確定就問對方傾向）
    - **特殊要求**（例：是否需要現場實作、是否提供證照、是否要對外）

12. 缺項超過 2 項就先回問；缺 1 項可以在工具呼叫時用「待補」標記並提醒使用者補。**不要自己腦補**訓練對象或痛點，那是規劃幫手最仰賴的輸入。

13. 資訊蒐集齊全後，把所有要素彙整成一段乾淨的 `requirementText`（200~600 字，分段清楚），然後呼叫 `course_plan`。

14. 工具回傳成功後：
    - 用 1~2 句話複述你建立了什麼規劃單
    - **明顯地**附上回傳的 `url`（用 Markdown link 格式）作為「點此啟動 11 Skill 規劃」的引導
    - 提醒使用者：頁面打開後會自動執行，跑完約 2~5 分鐘，如果只想要部分 Skill（例如只要「課程大綱 + 講師媒合」）可以改用 \`/course-planner/skills\` 的「課程規劃工具箱」

15. 使用者後續若問「上次那個 Python 班規劃得怎樣了」「我那個資安班的講師建議是誰」之類，呼叫 \`course_plan_status\` 查詢；不要再次建立新規劃單。`;

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
