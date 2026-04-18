/**
 * Agent 工具：主動簡報
 * 小瑞可以主動產生當日/明日的工作簡報，整合課程、鬧鈴、備忘等資訊。
 * 前端的 AlarmNotifier 可以定期觸發此工具。
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import type { AgentToolExecutor, AgentToolResult } from "../types";

export interface BriefingData {
  date: string;
  todayClasses: Array<{
    name: string;
    code: string | null;
    time: string;
    room: string | null;
    instructor: string | null;
    status: string | null;
  }>;
  tomorrowClasses: Array<{
    name: string;
    code: string | null;
    time: string;
    room: string | null;
    instructor: string | null;
    status: string | null;
  }>;
  upcomingAlarms: Array<{
    content: string;
    importance: string;
    alarmAt: string;
  }>;
  unreadMemories: number;
}

export async function generateBriefing(userId: string): Promise<BriefingData> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const tomorrowEnd = new Date(todayEnd);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  const userName = user?.name || "";

  const userConditions = [
    { trainerUserId: userId },
    ...(userName ? [
      { mentorName: { contains: userName } },
      { instructorNames: { contains: userName } },
    ] : []),
  ];

  const [todayClasses, tomorrowClasses, alarms, memories] = await Promise.all([
    prisma.trainingClass.findMany({
      where: {
        OR: userConditions,
        startDatetime: { lte: todayEnd },
        endDatetime: { gte: todayStart },
      },
      select: {
        className: true,
        classCode: true,
        startDatetime: true,
        endDatetime: true,
        roomName: true,
        instructorNames: true,
        status: true,
      },
      orderBy: { startDatetime: "asc" },
    }),
    prisma.trainingClass.findMany({
      where: {
        OR: userConditions,
        startDatetime: { lte: tomorrowEnd },
        endDatetime: { gte: tomorrowStart },
      },
      select: {
        className: true,
        classCode: true,
        startDatetime: true,
        endDatetime: true,
        roomName: true,
        instructorNames: true,
        status: true,
      },
      orderBy: { startDatetime: "asc" },
    }),
    prisma.classNote.findMany({
      where: {
        userId,
        alarmAt: { gte: now, lte: tomorrowEnd },
        alarmFired: false,
      },
      orderBy: { alarmAt: "asc" },
      take: 10,
    }),
    prisma.classNote.count({
      where: {
        userId,
        classId: null,
        content: { startsWith: "[小瑞記憶]" },
      },
    }),
  ]);

  const formatTime = (d: Date | null) =>
    d ? d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";

  return {
    date: now.toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric", weekday: "long" }),
    todayClasses: todayClasses.map((c) => ({
      name: c.className,
      code: c.classCode,
      time: `${formatTime(c.startDatetime)}-${formatTime(c.endDatetime)}`,
      room: c.roomName,
      instructor: c.instructorNames,
      status: c.status,
    })),
    tomorrowClasses: tomorrowClasses.map((c) => ({
      name: c.className,
      code: c.classCode,
      time: `${formatTime(c.startDatetime)}-${formatTime(c.endDatetime)}`,
      room: c.roomName,
      instructor: c.instructorNames,
      status: c.status,
    })),
    upcomingAlarms: alarms.map((a) => ({
      content: a.content,
      importance: a.importance,
      alarmAt: a.alarmAt?.toLocaleString("zh-TW") ?? "—",
    })),
    unreadMemories: memories,
  };
}

const definition = {
  name: "daily_briefing",
  description:
    "產生今日工作簡報，整合你今天和明天的課程、即將到期的鬧鈴提醒。適合在每天開始工作時使用，快速掌握當日狀況。",
  parameters: {
    type: "object",
    properties: {},
  },
} as const;

async function execute(
  params: Record<string, unknown>,
  ctx: { userId: string }
): Promise<AgentToolResult> {
  try {
    const briefing = await generateBriefing(ctx.userId);

    return {
      success: true,
      data: briefing,
    };
  } catch (e) {
    return { success: false, error: `簡報產生失敗：${(e as Error).message}` };
  }
}

export const dailyBriefingTool: AgentToolExecutor = { definition, execute };
