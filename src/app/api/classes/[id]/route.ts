/**
 * 【單一班次 API】GET：依 id 取詳情（含 trainer）；權限為管理員或負責培訓師。
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const { id } = await params;

  const cls = await prisma.trainingClass.findUnique({
    where: { id },
    include: {
      trainer: { select: { name: true, department: true, email: true } },
    },
  });

  if (!cls) {
    return NextResponse.json({ error: "找不到班次" }, { status: 404 });
  }

  const role = (session.user as { role?: string }).role;
  const userId = (session.user as { id?: string }).id;
  if (role !== "admin" && cls.trainerUserId !== userId) {
    return NextResponse.json({ error: "無權檢視此班次" }, { status: 403 });
  }

  // 若 ORM 未帶出 mentorName，直接以原生 SQL 讀 mentor_name 欄位（避免詳情顯示「-」但資料庫實際有值）
  let mentorName = cls.mentorName;
  if (!mentorName?.trim()) {
    const rows = await prisma.$queryRaw<Array<{ mentor_name: string | null }>>`
      SELECT mentor_name FROM training_classes WHERE id = ${cls.id}
    `;
    mentorName = rows[0]?.mentor_name ?? null;
  }

  return NextResponse.json({ ...cls, mentorName });
}
