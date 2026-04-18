/**
 * 【鬧鈴統一查詢】GET → 取得使用者所有鬧鈴（含班次附屬 + 個人獨立）
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未授權" }, { status: 401 });

  const userId = (session.user as any).id;
  const url = new URL(req.url);
  const filter = url.searchParams.get("filter"); // "upcoming" | "all"

  const where: Record<string, unknown> = { userId };

  if (filter === "upcoming") {
    where.alarmAt = { gte: new Date() };
    where.alarmFired = false;
  }

  const notes = await prisma.classNote.findMany({
    where,
    orderBy: { alarmAt: "asc" },
  });

  const classIds = notes
    .map((n) => n.classId)
    .filter((id): id is string => id !== null);

  const classMap = new Map<string, { className: string; classCode: string | null }>();
  if (classIds.length > 0) {
    const classes = await prisma.trainingClass.findMany({
      where: { id: { in: [...new Set(classIds)] } },
      select: { id: true, className: true, classCode: true },
    });
    for (const c of classes) {
      classMap.set(c.id, { className: c.className, classCode: c.classCode });
    }
  }

  const result = notes.map((n) => ({
    id: n.id,
    classId: n.classId,
    className: n.classId ? classMap.get(n.classId)?.className ?? null : null,
    classCode: n.classId ? classMap.get(n.classId)?.classCode ?? null : null,
    content: n.content,
    alarmAt: n.alarmAt?.toISOString() ?? null,
    alarmFired: n.alarmFired,
    importance: n.importance,
    createdAt: n.createdAt.toISOString(),
  }));

  return NextResponse.json(result);
}
