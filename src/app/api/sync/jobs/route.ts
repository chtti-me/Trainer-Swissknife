/**
 * 【同步紀錄 API】GET：最近 SyncJob 列表。
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

  const jobs = await prisma.syncJob.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  return NextResponse.json(jobs);
}
