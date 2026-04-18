/**
 * Agent 工具：工作流程自動化
 * 讓小瑞執行預定義的多步驟工作流程，一次完成複雜任務。
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import type { AgentToolExecutor, AgentToolResult, AgentExecutionContext } from "../types";

interface WorkflowStep {
  name: string;
  action: (ctx: AgentExecutionContext) => Promise<Record<string, unknown>>;
}

async function runWeeklyReport(ctx: AgentExecutionContext): Promise<Record<string, unknown>> {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const classes = await prisma.trainingClass.findMany({
    where: {
      startDatetime: { gte: weekStart, lte: weekEnd },
    },
    select: {
      className: true,
      classCode: true,
      startDatetime: true,
      endDatetime: true,
      status: true,
      campus: true,
      mentorName: true,
      instructorNames: true,
      roomName: true,
      deliveryMode: true,
      trainer: { select: { name: true } },
    },
    orderBy: { startDatetime: "asc" },
  });

  const byCampus: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const c of classes) {
    byCampus[c.campus || "未指定"] = (byCampus[c.campus || "未指定"] || 0) + 1;
    byStatus[c.status || "未指定"] = (byStatus[c.status || "未指定"] || 0) + 1;
  }

  return {
    period: `${weekStart.toLocaleDateString("zh-TW")} ~ ${weekEnd.toLocaleDateString("zh-TW")}`,
    totalClasses: classes.length,
    byCampus,
    byStatus,
    classList: classes.map((c) => ({
      name: c.className,
      code: c.classCode,
      date: c.startDatetime?.toLocaleDateString("zh-TW") ?? "—",
      time: c.startDatetime
        ? `${c.startDatetime.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}-${c.endDatetime?.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }) ?? ""}`
        : "—",
      status: c.status,
      campus: c.campus,
      mentor: c.mentorName ?? c.trainer?.name ?? "—",
      instructor: c.instructorNames ?? "—",
      room: c.roomName ?? "—",
      mode: c.deliveryMode ?? "—",
    })),
  };
}

async function runMonthlyStats(ctx: AgentExecutionContext): Promise<Record<string, unknown>> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const classes = await prisma.trainingClass.findMany({
    where: {
      startDatetime: { gte: monthStart, lte: monthEnd },
    },
    select: {
      className: true,
      status: true,
      campus: true,
      category: true,
      deliveryMode: true,
    },
  });

  const byCategory: Record<string, number> = {};
  const byMode: Record<string, number> = {};
  for (const c of classes) {
    byCategory[c.category || "未分類"] = (byCategory[c.category || "未分類"] || 0) + 1;
    byMode[c.deliveryMode || "未指定"] = (byMode[c.deliveryMode || "未指定"] || 0) + 1;
  }

  return {
    month: `${now.getFullYear()}年${now.getMonth() + 1}月`,
    totalClasses: classes.length,
    byCategory,
    byMode,
  };
}

async function runMyUpcomingClasses(ctx: AgentExecutionContext): Promise<Record<string, unknown>> {
  const now = new Date();
  const twoWeeksLater = new Date(now);
  twoWeeksLater.setDate(now.getDate() + 14);

  const user = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });
  const userName = user?.name || "";

  const classes = await prisma.trainingClass.findMany({
    where: {
      OR: [
        { trainerUserId: ctx.userId },
        ...(userName ? [{ mentorName: { contains: userName } }, { instructorNames: { contains: userName } }] : []),
      ],
      startDatetime: { gte: now, lte: twoWeeksLater },
    },
    select: {
      className: true,
      classCode: true,
      startDatetime: true,
      endDatetime: true,
      status: true,
      roomName: true,
      instructorNames: true,
      mentorName: true,
    },
    orderBy: { startDatetime: "asc" },
  });

  return {
    period: `${now.toLocaleDateString("zh-TW")} ~ ${twoWeeksLater.toLocaleDateString("zh-TW")}`,
    totalClasses: classes.length,
    classes: classes.map((c) => ({
      name: c.className,
      code: c.classCode,
      date: c.startDatetime?.toLocaleDateString("zh-TW") ?? "—",
      time: c.startDatetime?.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }) ?? "—",
      status: c.status,
      room: c.roomName ?? "—",
      instructor: c.instructorNames ?? "—",
    })),
  };
}

async function runPendingAlarms(ctx: AgentExecutionContext): Promise<Record<string, unknown>> {
  const notes = await prisma.classNote.findMany({
    where: {
      userId: ctx.userId,
      alarmAt: { gte: new Date() },
      alarmFired: false,
    },
    orderBy: { alarmAt: "asc" },
    take: 20,
  });

  return {
    count: notes.length,
    alarms: notes.map((n) => ({
      content: n.content,
      importance: n.importance,
      alarmAt: n.alarmAt?.toLocaleString("zh-TW") ?? "—",
      isClassNote: !!n.classId,
    })),
  };
}

const WORKFLOWS: Record<string, {
  name: string;
  description: string;
  runner: (ctx: AgentExecutionContext) => Promise<Record<string, unknown>>;
}> = {
  weekly_report: {
    name: "本週培訓週報",
    description: "彙整本週所有開班資訊，依院區、狀態分類統計",
    runner: runWeeklyReport,
  },
  monthly_stats: {
    name: "本月培訓統計",
    description: "統計本月開班數量、類別分佈、授課方式分佈",
    runner: runMonthlyStats,
  },
  my_upcoming: {
    name: "我的近兩週課程",
    description: "列出你負責的未來兩週內所有課程詳情",
    runner: runMyUpcomingClasses,
  },
  pending_alarms: {
    name: "待辦提醒總覽",
    description: "列出所有尚未到期的鬧鈴和備註提醒",
    runner: runPendingAlarms,
  },
};

const definition = {
  name: "workflow_run",
  description: `執行預定義的多步驟工作流程，一次完成複雜的彙整任務。可用的工作流程：${Object.entries(WORKFLOWS)
    .map(([k, v]) => `${k}（${v.description}）`)
    .join("、")}。執行完畢後，請將資料整理成容易閱讀的格式回覆使用者。`,
  parameters: {
    type: "object",
    properties: {
      workflowName: {
        type: "string",
        enum: Object.keys(WORKFLOWS),
        description: "要執行的工作流程名稱",
      },
    },
    required: ["workflowName"],
  },
} as const;

async function execute(
  params: Record<string, unknown>,
  ctx: AgentExecutionContext
): Promise<AgentToolResult> {
  try {
    const name = String(params.workflowName || "");
    const wf = WORKFLOWS[name];
    if (!wf) {
      return {
        success: false,
        error: `未知的工作流程「${name}」。可用：${Object.keys(WORKFLOWS).join("、")}`,
      };
    }

    const result = await wf.runner(ctx);

    return {
      success: true,
      data: {
        workflowName: name,
        workflowTitle: wf.name,
        ...result,
      },
    };
  } catch (e) {
    return { success: false, error: `工作流程執行失敗：${(e as Error).message}` };
  }
}

export const workflowTool: AgentToolExecutor = { definition, execute };
