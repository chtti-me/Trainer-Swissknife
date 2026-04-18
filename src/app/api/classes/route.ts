/**
 * 【班次列表 API】GET：依角色與查詢參數篩選 TrainingClass；必要時以 SQL 補齊 mentorName。
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const userId = (session.user as { id?: string }).id;
  const role = (session.user as { role?: string }).role;
  const isAdmin = role === "admin";
  /** 管理員預設看全院；培訓師僅看 trainerUserId 為本人之班次。管理員可傳 myOnly=true 只看自己負責班。 */
  const campus = params.get("campus");
  const classType = params.get("classType");
  const deliveryMode = params.get("deliveryMode");
  const keyword = params.get("keyword");
  const startDate = params.get("startDate");
  const endDate = params.get("endDate");
  const status = params.get("status");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (!isAdmin || params.get("myOnly") === "true") {
    where.trainerUserId = userId;
  }

  if (campus) where.campus = campus;
  if (classType) where.classType = classType;
  if (deliveryMode) where.deliveryMode = deliveryMode;
  if (status) where.status = status;

  if (startDate || endDate) {
    where.startDatetime = {};
    if (startDate) where.startDatetime.gte = new Date(startDate);
    if (endDate) where.startDatetime.lte = new Date(endDate);
  }

  if (keyword) {
    where.OR = [
      { className: { contains: keyword } },
      { classCode: { contains: keyword } },
      { tisClassId5: { contains: keyword } },
      { tisSessionCode: { contains: keyword } },
      { mentorName: { contains: keyword } },
      { instructorNames: { contains: keyword } },
    ];
  }

  const classes = await prisma.trainingClass.findMany({
    where,
    orderBy: { startDatetime: "asc" },
    include: {
      trainer: { select: { name: true } },
    },
  });

  const missingMentorIds = classes.filter((c) => !c.mentorName?.trim()).map((c) => c.id);
  const mentorById = new Map<string, string>();
  if (missingMentorIds.length > 0) {
    const rows = await prisma.$queryRaw<Array<{ id: string; mentor_name: string | null }>>`
      SELECT id, mentor_name FROM training_classes WHERE id IN (${Prisma.join(missingMentorIds)})
    `;
    for (const r of rows) {
      const v = r.mentor_name?.trim();
      if (v) mentorById.set(r.id, v);
    }
  }

  const withMentor = classes.map((c) => {
    if (c.mentorName?.trim()) return c;
    const fallback = mentorById.get(c.id);
    return fallback ? { ...c, mentorName: fallback } : c;
  });

  return NextResponse.json(withMentor);
}
