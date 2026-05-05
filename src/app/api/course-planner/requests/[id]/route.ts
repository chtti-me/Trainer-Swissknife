/**
 * 課程規劃幫手 — 單一 Request 端點
 *  GET    /api/course-planner/requests/[id]   取得 request 詳情
 *  PATCH  /api/course-planner/requests/[id]   更新 request（決定沿用既有班、修改 title）
 *  DELETE /api/course-planner/requests/[id]   刪除 request
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

  const request = await prisma.coursePlanRequest.findFirst({
    where: { id, createdBy: userId },
    include: {
      drafts: {
        orderBy: { versionNo: "desc" },
        take: 20,
        select: {
          id: true,
          versionNo: true,
          changeNote: true,
          createdAt: true,
        },
      },
    },
  });
  if (!request) return NextResponse.json({ error: "找不到規劃需求" }, { status: 404 });

  return NextResponse.json({ request });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    reuseClassId?: string | null;
    status?: "pending" | "running" | "completed" | "reuse_existing" | "failed";
    /** "openai" | "gemini" | "groq"；空字串 / null = 走 env 預設 */
    aiProvider?: string | null;
  };

  const existing = await prisma.coursePlanRequest.findFirst({
    where: { id, createdBy: userId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "找不到規劃需求" }, { status: 404 });

  const aiProviderUpdate = (() => {
    if (body.aiProvider === undefined) return {};
    if (body.aiProvider === null || body.aiProvider === "") return { aiProvider: null };
    const v = String(body.aiProvider).trim().toLowerCase();
    if (v === "openai" || v === "gemini" || v === "groq") return { aiProvider: v };
    return {};
  })();

  const updated = await prisma.coursePlanRequest.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title || null } : {}),
      ...(body.reuseClassId !== undefined ? { reuseClassId: body.reuseClassId } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...aiProviderUpdate,
    },
  });

  return NextResponse.json({ request: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const { id } = await params;

  const existing = await prisma.coursePlanRequest.findFirst({
    where: { id, createdBy: userId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "找不到規劃需求" }, { status: 404 });

  await prisma.coursePlanRequest.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
