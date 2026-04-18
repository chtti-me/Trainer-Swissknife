/**
 * 【班次備註 CRUD】GET 列出 / POST 新增
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未授權" }, { status: 401 });

  const { id: classId } = await params;
  const notes = await prisma.classNote.findMany({
    where: { classId, userId: (session.user as any).id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(notes);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未授權" }, { status: 401 });

  const { id: classId } = await params;
  const body = await req.json();
  const { content, alarmAt, importance } = body as {
    content: string;
    alarmAt?: string | null;
    importance?: string;
  };

  if (!content?.trim()) {
    return NextResponse.json({ error: "備註內容不可為空" }, { status: 400 });
  }

  const note = await prisma.classNote.create({
    data: {
      classId,
      userId: (session.user as any).id,
      content: content.trim(),
      alarmAt: alarmAt ? new Date(alarmAt) : null,
      importance: importance || "normal",
    },
  });
  return NextResponse.json(note, { status: 201 });
}
