/**
 * 【鬧鈴管理】PATCH / DELETE → 編輯或刪除任何鬧鈴（含班次附屬 + 個人獨立）
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ noteId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未授權" }, { status: 401 });

  const { noteId } = await params;
  const userId = (session.user as any).id;

  const existing = await prisma.classNote.findFirst({ where: { id: noteId, userId } });
  if (!existing) return NextResponse.json({ error: "找不到備註" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (typeof body.content === "string") data.content = body.content.trim();
  if (body.alarmAt !== undefined) {
    data.alarmAt = body.alarmAt ? new Date(body.alarmAt) : null;
    data.alarmFired = false;
  }
  if (typeof body.importance === "string") data.importance = body.importance;

  const updated = await prisma.classNote.update({ where: { id: noteId }, data });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ noteId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未授權" }, { status: 401 });

  const { noteId } = await params;
  const userId = (session.user as any).id;

  const existing = await prisma.classNote.findFirst({ where: { id: noteId, userId } });
  if (!existing) return NextResponse.json({ error: "找不到備註" }, { status: 404 });

  await prisma.classNote.delete({ where: { id: noteId } });
  return NextResponse.json({ ok: true });
}
