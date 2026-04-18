/**
 * 【個人獨立鬧鈴】POST → 新增不綁定班次的鬧鈴
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未授權" }, { status: 401 });

  const userId = (session.user as any).id;
  const body = await req.json();
  const { content, alarmAt, importance, classId } = body as {
    content: string;
    alarmAt?: string | null;
    importance?: string;
    classId?: string | null;
  };

  if (!content?.trim()) {
    return NextResponse.json({ error: "備註內容不可為空" }, { status: 400 });
  }

  const note = await prisma.classNote.create({
    data: {
      classId: classId || null,
      userId,
      content: content.trim(),
      alarmAt: alarmAt ? new Date(alarmAt) : null,
      importance: importance || "normal",
    },
  });

  return NextResponse.json(note, { status: 201 });
}
