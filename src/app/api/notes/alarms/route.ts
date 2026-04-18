/**
 * 【鬧鈴提醒輪詢】GET 回傳到期且未觸發的鬧鈴
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未授權" }, { status: 401 });

  const userId = (session.user as any).id;
  const now = new Date();

  const dueAlarms = await prisma.classNote.findMany({
    where: {
      userId,
      alarmAt: { lte: now },
      alarmFired: false,
    },
    orderBy: { alarmAt: "asc" },
  });

  if (dueAlarms.length > 0) {
    await prisma.classNote.updateMany({
      where: { id: { in: dueAlarms.map((a) => a.id) } },
      data: { alarmFired: true },
    });
  }

  return NextResponse.json(dueAlarms);
}
