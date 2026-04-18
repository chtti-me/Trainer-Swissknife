/**
 * Agent 工具：課程規劃
 * 呼叫現有 runCoursePlanAgent 產出開班計劃表欄位。
 */
import "server-only";

import type { AgentToolExecutor, AgentExecutionContext, AgentToolResult } from "../types";
import { runCoursePlanAgent } from "@/lib/planning/agent";
import type { CoursePlanInput } from "@/lib/planning/types";

const definition = {
  name: "course_plan",
  description:
    "根據培訓需求文字，一次產出開班計劃表所需欄位（建議班名、目標、對象、預備知識、課程模組、建議講師）。適合使用者提供培訓需求後呼叫。",
  parameters: {
    type: "object",
    properties: {
      requirementText: {
        type: "string",
        description: "培訓需求完整文字（必填）",
      },
      preferredTitle: {
        type: "string",
        description: "使用者偏好的課程名稱（選填）",
      },
      preferredHours: {
        type: "number",
        description: "使用者偏好的總時數（選填）",
      },
    },
    required: ["requirementText"],
  },
} as const;

async function execute(
  params: Record<string, unknown>,
  ctx: AgentExecutionContext
): Promise<AgentToolResult> {
  try {
    const input: CoursePlanInput = {
      requirementText: String(params.requirementText || ""),
      preferredTitle: params.preferredTitle ? String(params.preferredTitle) : undefined,
      preferredHours: params.preferredHours ? Number(params.preferredHours) : undefined,
    };

    if (!input.requirementText.trim()) {
      return { success: false, error: "培訓需求文字不得為空" };
    }

    const result = await runCoursePlanAgent(input, {
      skillContextAppend: ctx.skillAppend,
    });

    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: `課程規劃失敗：${(e as Error).message}` };
  }
}

export const coursePlanTool: AgentToolExecutor = { definition, execute };
