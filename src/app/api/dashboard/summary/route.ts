/**
 * 【儀表板摘要 API】
 * 回傳班次統計、近期班次、提醒數字、最近同步紀錄等。
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const now = new Date();
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const ninetyDaysLater = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const role = (session.user as { role?: string }).role;
  const userId = (session.user as { id?: string }).id;
  const mine = role !== "admin" && userId ? { trainerUserId: userId } : {};

  const [
    totalClasses,
    upcomingClasses,
    soonClasses,
    missingInstructor,
    missingRoom,
    incompleteClasses,
    missingRequestSource,
    latestSync,
  ] = await Promise.all([
    prisma.trainingClass.count({ where: { ...mine } }),
    prisma.trainingClass.count({
      where: { ...mine, startDatetime: { gte: now, lte: ninetyDaysLater } },
    }),
    prisma.trainingClass.findMany({
      where: {
        ...mine,
        startDatetime: { gte: now, lte: sevenDaysLater },
      },
      orderBy: { startDatetime: "asc" },
    }),
    prisma.trainingClass.count({
      where: {
        ...mine,
        instructorNames: null,
        startDatetime: { gte: now },
      },
    }),
    prisma.trainingClass.count({
      where: {
        ...mine,
        roomName: null,
        startDatetime: { gte: now },
      },
    }),
    prisma.trainingClass.count({
      where: {
        ...mine,
        startDatetime: { gte: now },
        OR: [{ summary: null }, { audience: null }],
      },
    }),
    prisma.trainingClass.count({
      where: {
        ...mine,
        classType: "臨時需求專案班",
        requestSource: null,
      },
    }),
    prisma.syncJob.findFirst({ orderBy: { startedAt: "desc" } }),
  ]);

  return NextResponse.json({
    totalClasses,
    upcomingClasses,
    soonClasses,
    reminders: {
      soonCount: soonClasses.length,
      missingInstructor,
      missingRoom,
      incompleteClasses,
      missingRequestSource,
    },
    latestSync: latestSync
      ? {
          id: latestSync.id,
          sourceName: latestSync.sourceName,
          status: latestSync.status,
          startedAt: latestSync.startedAt,
          totalCount: latestSync.totalCount,
          successCount: latestSync.successCount,
          failedCount: latestSync.failedCount,
        }
      : null,
  });
}
