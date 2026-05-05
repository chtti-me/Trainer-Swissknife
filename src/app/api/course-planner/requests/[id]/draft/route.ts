/**
 * 課程規劃幫手 — 草案版本管理
 *  GET   /api/course-planner/requests/[id]/draft         列出版本
 *  POST  /api/course-planner/requests/[id]/draft         儲存新版本
 *  PATCH /api/course-planner/requests/[id]/draft         以 finalForm + finalAuxDocs 寫入 request（內聯編輯快存）
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CoursePlanFormSchema, AuxiliaryDocsSchema } from "@/lib/course-planner/schemas/form";

export const runtime = "nodejs";

async function ownedRequest(id: string, userId: string) {
  return prisma.coursePlanRequest.findFirst({
    where: { id, createdBy: userId },
    select: { id: true },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const { id } = await params;

  const exists = await ownedRequest(id, userId);
  if (!exists) return NextResponse.json({ error: "找不到規劃需求" }, { status: 404 });

  const drafts = await prisma.coursePlanDraft.findMany({
    where: { requestId: id },
    orderBy: { versionNo: "desc" },
    select: {
      id: true,
      versionNo: true,
      formJson: true,
      auxDocsJson: true,
      changeNote: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ drafts });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const { id } = await params;

  const exists = await ownedRequest(id, userId);
  if (!exists) return NextResponse.json({ error: "找不到規劃需求" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    form?: unknown;
    auxDocs?: unknown;
    changeNote?: string;
  } | null;
  if (!body?.form) return NextResponse.json({ error: "請提供 form" }, { status: 400 });

  let formParsed;
  try {
    formParsed = CoursePlanFormSchema.parse(body.form);
  } catch (e) {
    return NextResponse.json({ error: `form 格式錯誤：${(e as Error).message}` }, { status: 400 });
  }
  const auxParsed = body.auxDocs ? AuxiliaryDocsSchema.parse(body.auxDocs) : null;

  const last = await prisma.coursePlanDraft.findFirst({
    where: { requestId: id },
    orderBy: { versionNo: "desc" },
    select: { versionNo: true },
  });
  const nextVersion = (last?.versionNo ?? 0) + 1;

  const draft = await prisma.coursePlanDraft.create({
    data: {
      requestId: id,
      versionNo: nextVersion,
      formJson: formParsed as Prisma.InputJsonValue,
      auxDocsJson: auxParsed
        ? (auxParsed as Prisma.InputJsonValue)
        : Prisma.DbNull,
      changeNote: body.changeNote || null,
      createdBy: userId,
    },
    select: {
      id: true,
      versionNo: true,
      formJson: true,
      auxDocsJson: true,
      changeNote: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ draft });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const { id } = await params;

  const exists = await ownedRequest(id, userId);
  if (!exists) return NextResponse.json({ error: "找不到規劃需求" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    form?: unknown;
    auxDocs?: unknown;
  } | null;
  if (!body?.form) return NextResponse.json({ error: "請提供 form" }, { status: 400 });

  let formParsed;
  try {
    formParsed = CoursePlanFormSchema.parse(body.form);
  } catch (e) {
    return NextResponse.json({ error: `form 格式錯誤：${(e as Error).message}` }, { status: 400 });
  }
  const auxParsed = body.auxDocs ? AuxiliaryDocsSchema.parse(body.auxDocs) : null;

  const updated = await prisma.coursePlanRequest.update({
    where: { id },
    data: {
      finalForm: formParsed as Prisma.InputJsonValue,
      ...(auxParsed ? { finalAuxDocs: auxParsed as Prisma.InputJsonValue } : {}),
    },
    select: { id: true, finalForm: true, finalAuxDocs: true, updatedAt: true },
  });

  return NextResponse.json({ request: updated });
}
