/**
 * 【培訓師名冊 API】GET：Trainer 表列表（TIS 導師／開班導師）。
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

  const trainers = await prisma.trainer.findMany({
    orderBy: { name: "asc" },
    include: { linkedUser: { select: { id: true, email: true, name: true } } },
  });

  return NextResponse.json(trainers);
}
