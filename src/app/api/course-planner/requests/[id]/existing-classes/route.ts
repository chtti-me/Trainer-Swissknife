/**
 * 課程規劃幫手 — 既有班相似度搜尋（讀取 / 重跑）
 *  GET /api/course-planner/requests/[id]/existing-classes  從快取讀取或即時搜尋
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findSimilarExistingClasses } from "@/lib/course-planner/existing-class-lookup";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const { id } = await params;

  const request = await prisma.coursePlanRequest.findFirst({
    where: { id, createdBy: userId },
    select: { id: true, rawInputText: true },
  });
  if (!request) return NextResponse.json({ error: "找不到規劃需求" }, { status: 404 });

  const result = await findSimilarExistingClasses(request.rawInputText, { topK: 5 });
  return NextResponse.json(result);
}
