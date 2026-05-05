/**
 * Agent 工具：課程規劃
 *
 * 由於新版「課程規劃幫手」是 11 Skill 串流 pipeline，
 * 在 Agent chat 內無法即時呈現完整 SSE 進度與互動式編輯，
 * 因此本工具改採「建立規劃需求 + 回傳網址」模式：
 *   1. 用使用者貼上的需求文字建立一筆 CoursePlanRequest
 *   2. 回傳該需求的 ID 與專屬頁面連結（培訓師點開即可看完整 pipeline）
 *
 * 若需要立即在 chat 中看到結果，建議使用 instructor_search / db_query 等
 * 較細粒度工具組合，或直接到「課程規劃幫手」頁面執行完整流程。
 */
import "server-only";

import type { AgentToolExecutor, AgentExecutionContext, AgentToolResult } from "../types";
import { prisma } from "@/lib/prisma";

const definition = {
  name: "course_plan",
  description:
    "為使用者建立一筆完整的「課程規劃幫手」規劃需求單（會跑 11 個 AI Skill 產出完整開班計畫表草案 + 4 份輔助文件）。**呼叫前務必先確認規劃六要素**：訓練主題、訓練對象、痛點/能力需求、預期時數、形式偏好、特殊要求；若使用者敘述模糊就先問清楚再呼叫，不要腦補訓練對象或痛點。requirementText 應為彙整後的完整段落（200~600 字），不是貼回使用者原話。回傳後請以 Markdown link 醒目地把 url 給使用者，提醒打開即會自動跑完整 11 Skill。若使用者只要部分 Skill（如只要大綱+講師），改建議他們去 /course-planner/skills 的「課程規劃工具箱」，不要呼叫此工具。",
  parameters: {
    type: "object",
    properties: {
      requirementText: {
        type: "string",
        description:
          "彙整後的完整培訓需求段落（必填，至少 30 字、建議 200~600 字）。應包含：訓練主題、訓練對象（誰、規模、背景）、痛點與能力需求、預期時數/天數、形式偏好、特殊要求等六要素。請寫成連貫段落，不是逐項條列；必要時可加副標題分段。",
      },
      title: {
        type: "string",
        description:
          "工作標題（選填）。若未提供，系統會在 pipeline 啟動後由 AI 自動命名。建議留空讓系統自取。",
      },
    },
    required: ["requirementText"],
  },
} as const;

async function execute(
  params: Record<string, unknown>,
  ctx: AgentExecutionContext,
): Promise<AgentToolResult> {
  try {
    const requirementText = String(params.requirementText || "").trim();
    if (requirementText.length < 30) {
      return {
        success: false,
        error:
          "requirementText 過短（< 30 字）。請先和使用者確認規劃六要素：訓練主題、訓練對象、痛點/能力需求、預期時數、形式偏好、特殊要求；缺項超過 2 項請先發問再呼叫此工具。",
      };
    }

    const userId = ctx.userId;
    if (!userId) {
      return { success: false, error: "找不到當前使用者，無法建立規劃需求" };
    }

    const request = await prisma.coursePlanRequest.create({
      data: {
        createdBy: userId,
        title: params.title ? String(params.title).trim() : null,
        rawInputText: requirementText,
        status: "pending",
      },
      select: { id: true, title: true, status: true, createdAt: true },
    });

    const url = `/course-planner/${request.id}?autostart=1`;

    return {
      success: true,
      data: {
        requestId: request.id,
        title: request.title,
        status: request.status,
        url,
        message:
          `已建立規劃需求單（id=${request.id}）。請打開以下連結啟動 11 Skill pipeline，` +
          `系統會在頁面上即時顯示需求分析→學員輪廓→學習目標→課程大綱→…→講師媒合→課程文案 等步驟，` +
          `跑完約 2~5 分鐘。若只要部分 Skill，請改用 /course-planner/skills 工具箱。`,
        followUpHint:
          "請以 Markdown 連結明顯呈現此網址，例如：[👉 啟動課程規劃 pipeline](該網址)。",
      },
    };
  } catch (e) {
    return { success: false, error: `建立課程規劃需求失敗：${(e as Error).message}` };
  }
}

export const coursePlanTool: AgentToolExecutor = { definition, execute };
