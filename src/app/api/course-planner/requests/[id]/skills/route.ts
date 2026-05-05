/**
 * 課程規劃幫手 — 列出某個 request 的所有 SkillRun
 *  GET /api/course-planner/requests/[id]/skills
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const { id } = await params;

  const exists = await prisma.coursePlanRequest.findFirst({
    where: { id, createdBy: userId },
    select: { id: true },
  });
  if (!exists) return NextResponse.json({ error: "找不到規劃需求" }, { status: 404 });

  const runs = await prisma.coursePlanSkillRun.findMany({
    where: { requestId: id },
    orderBy: [{ skillName: "asc" }, { sequence: "desc" }],
    select: {
      id: true,
      skillName: true,
      sequence: true,
      status: true,
      reasoning: true,
      output: true,
      error: true,
      durationMs: true,
      model: true,
      createdAt: true,
    },
  });

  // 對每個 skill 只回傳「最新一筆 sequence」
  const latestBySkill = new Map<string, (typeof runs)[number]>();
  for (const r of runs) {
    if (!latestBySkill.has(r.skillName)) latestBySkill.set(r.skillName, r);
  }

  return NextResponse.json({ runs: Array.from(latestBySkill.values()) });
}
