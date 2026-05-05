/**
 * Agent 工具：課程規劃進度查詢
 *
 * 讓小瑞回答「上次那個 Python 班規劃得怎樣了」、
 * 「我那個資安班的講師建議是誰」之類的後續追問，
 * 不必再呼叫 course_plan 重新建單。
 *
 * 支援兩種查詢模式：
 *   1. 指定 requestId：精確查某一筆
 *   2. 不指定 + searchText：模糊比對最近的規劃單
 *
 * 回傳 status / 各 Skill 完成狀況 / 草案重點摘要 / 詳情頁網址。
 */
import "server-only";

import type { AgentToolExecutor, AgentExecutionContext, AgentToolResult } from "../types";
import { prisma } from "@/lib/prisma";
import { SKILL_DISPLAY_NAMES, type SkillName } from "@/lib/course-planner/schemas/common";

const definition = {
  name: "course_plan_status",
  description:
    "查詢使用者既有的課程規劃需求單（CoursePlanRequest）的狀態與摘要。當使用者問「上次那個 X 班規劃得怎樣」「我那個 Y 班的講師建議」「我之前用課程規劃幫手做的 Z」之類後續追問時呼叫。可用 requestId 精確查、或用 searchText 在最近 30 筆中模糊找。回傳：status、目前進行中的 Skill、各 Skill 是否成功、草案頂部摘要（班名、總時數、堂數、主推講師）、詳情頁網址。**不要**用此工具來建立新規劃單（建立用 course_plan）。",
  parameters: {
    type: "object",
    properties: {
      requestId: {
        type: "string",
        description: "規劃單 ID（uuid）。若使用者明確提供就用這個。",
      },
      searchText: {
        type: "string",
        description:
          "在最近 30 筆規劃單的 title / rawInputText 做模糊比對的關鍵字（例：「Python」「資安」）。requestId 沒提供時用這個。",
      },
      limit: {
        type: "number",
        description: "搜尋模式時最多回傳幾筆（預設 5，最大 10）。",
      },
    },
  },
} as const;

interface SkillRunSummary {
  skill: string;
  displayName: string;
  status: string;
  durationMs: number | null;
  error: string | null;
}

interface RequestSummary {
  id: string;
  title: string | null;
  status: string;
  currentSkill: string | null;
  rawInputText: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  draftUrl: string | null;
  skillRuns: SkillRunSummary[];
  draftHighlights?: {
    topic?: string;
    totalHours?: number;
    sessionCount?: number;
    primaryInstructors?: string[];
  };
}

function buildHighlights(
  finalForm: unknown,
): RequestSummary["draftHighlights"] | undefined {
  if (!finalForm || typeof finalForm !== "object") return undefined;
  const f = finalForm as {
    aiFilled?: {
      topic?: string;
      sessions?: Array<{ hours?: number; primaryInstructorName?: string }>;
    };
  };
  const ai = f.aiFilled;
  if (!ai) return undefined;
  const totalHours = (ai.sessions ?? []).reduce(
    (sum, s) => sum + (typeof s.hours === "number" ? s.hours : 0),
    0,
  );
  const primaryInstructors = Array.from(
    new Set(
      (ai.sessions ?? [])
        .map((s) => s.primaryInstructorName?.trim())
        .filter((x): x is string => Boolean(x)),
    ),
  );
  return {
    topic: ai.topic,
    totalHours,
    sessionCount: ai.sessions?.length ?? 0,
    primaryInstructors,
  };
}

async function summarizeRequest(requestId: string, userId: string): Promise<RequestSummary | null> {
  const req = await prisma.coursePlanRequest.findFirst({
    where: { id: requestId, createdBy: userId },
    select: {
      id: true,
      title: true,
      status: true,
      currentSkill: true,
      rawInputText: true,
      finalForm: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!req) return null;

  const runs = await prisma.coursePlanSkillRun.findMany({
    where: { requestId },
    orderBy: [{ skillName: "asc" }, { sequence: "desc" }],
    select: {
      skillName: true,
      sequence: true,
      status: true,
      durationMs: true,
      error: true,
    },
  });
  const latestPerSkill = new Map<string, SkillRunSummary>();
  for (const r of runs) {
    if (latestPerSkill.has(r.skillName)) continue;
    latestPerSkill.set(r.skillName, {
      skill: r.skillName,
      displayName: SKILL_DISPLAY_NAMES[r.skillName as SkillName] ?? r.skillName,
      status: r.status,
      durationMs: r.durationMs,
      error: r.error,
    });
  }

  return {
    id: req.id,
    title: req.title,
    status: req.status,
    currentSkill: req.currentSkill,
    rawInputText: req.rawInputText.length > 200 ? req.rawInputText.slice(0, 200) + "…" : req.rawInputText,
    createdAt: req.createdAt.toISOString(),
    updatedAt: req.updatedAt.toISOString(),
    url: `/course-planner/${req.id}`,
    draftUrl: req.status === "completed" ? `/course-planner/${req.id}/draft` : null,
    skillRuns: Array.from(latestPerSkill.values()),
    draftHighlights: buildHighlights(req.finalForm),
  };
}

async function execute(
  params: Record<string, unknown>,
  ctx: AgentExecutionContext,
): Promise<AgentToolResult> {
  const userId = ctx.userId;
  if (!userId) {
    return { success: false, error: "找不到當前使用者" };
  }

  const requestId = typeof params.requestId === "string" ? params.requestId.trim() : "";
  const searchText = typeof params.searchText === "string" ? params.searchText.trim() : "";
  const limit = Math.max(1, Math.min(10, Number(params.limit) || 5));

  if (requestId) {
    const summary = await summarizeRequest(requestId, userId);
    if (!summary) {
      return {
        success: false,
        error: `找不到規劃單（id=${requestId}）或該規劃單不屬於當前使用者`,
      };
    }
    return { success: true, data: { matched: 1, items: [summary] } };
  }

  if (!searchText) {
    return {
      success: false,
      error: "請提供 requestId（精確查詢）或 searchText（模糊搜尋）至少一個。",
    };
  }

  const candidates = await prisma.coursePlanRequest.findMany({
    where: {
      createdBy: userId,
      OR: [
        { title: { contains: searchText, mode: "insensitive" } },
        { rawInputText: { contains: searchText, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { id: true },
  });

  if (candidates.length === 0) {
    return {
      success: true,
      data: {
        matched: 0,
        items: [],
        message: `沒有找到包含「${searchText}」的規劃單。可請使用者改用 requestId 精確查詢，或先到 /course-planner 查看完整列表。`,
      },
    };
  }

  const items: RequestSummary[] = [];
  for (const c of candidates) {
    const s = await summarizeRequest(c.id, userId);
    if (s) items.push(s);
  }

  return { success: true, data: { matched: items.length, items } };
}

export const coursePlanStatusTool: AgentToolExecutor = { definition, execute };
