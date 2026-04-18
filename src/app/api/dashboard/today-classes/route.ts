/**
 * 【當日授課清單】GET → 查詢今天該培訓師擔任導師或講師的課程
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未授權" }, { status: 401 });

  const userId = (session.user as any).id;
  const userName = (session.user as any).name || "";

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  const classes = await prisma.trainingClass.findMany({
    where: {
      OR: [
        { trainerUserId: userId },
        ...(userName ? [
          { mentorName: { contains: userName } },
          { instructorNames: { contains: userName } },
        ] : []),
      ],
      startDatetime: { lte: todayEnd },
      endDatetime: { gte: todayStart },
    },
    select: {
      id: true,
      className: true,
      classCode: true,
      startDatetime: true,
      endDatetime: true,
      checkinDatetime: true,
      instructorNames: true,
      mentorName: true,
      roomName: true,
      location: true,
      campus: true,
      status: true,
      deliveryMode: true,
      trainer: { select: { name: true } },
    },
    orderBy: { startDatetime: "asc" },
  });

  const result = classes.map((c) => {
    let role = "導師";
    if (c.instructorNames && userName && c.instructorNames.includes(userName)) {
      role = c.mentorName === userName || c.trainer?.name === userName
        ? "導師兼講師" : "授課講師";
    }

    return {
      id: c.id,
      className: c.className,
      classCode: c.classCode,
      startDatetime: c.startDatetime?.toISOString() ?? null,
      endDatetime: c.endDatetime?.toISOString() ?? null,
      checkinDatetime: c.checkinDatetime?.toISOString() ?? null,
      instructorNames: c.instructorNames,
      mentorName: c.mentorName ?? c.trainer?.name ?? null,
      roomName: c.roomName,
      location: c.location,
      campus: c.campus,
      status: c.status,
      deliveryMode: c.deliveryMode,
      role,
    };
  });

  return NextResponse.json(result);
}
