/**
 * 【備註匯出】GET → Markdown 下載
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const IMPORTANCE_LABEL: Record<string, string> = {
  normal: "一般",
  important: "重要",
  critical: "極重要",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未授權" }, { status: 401 });

  const { id: classId } = await params;
  const userId = (session.user as any).id;

  const cls = await prisma.trainingClass.findUnique({
    where: { id: classId },
    select: { className: true, classCode: true },
  });

  const notes = await prisma.classNote.findMany({
    where: { classId, userId },
    orderBy: { createdAt: "desc" },
  });

  const lines: string[] = [
    `# 備註筆記：${cls?.className || classId}`,
    cls?.classCode ? `> 班代號：${cls.classCode}` : "",
    `> 匯出時間：${new Date().toLocaleString("zh-TW")}`,
    `> 共 ${notes.length} 則備註`,
    "",
    "---",
    "",
  ].filter(Boolean);

  for (const note of notes) {
    const imp = IMPORTANCE_LABEL[note.importance] || note.importance;
    lines.push(`## [${imp}] ${new Date(note.createdAt).toLocaleString("zh-TW")}`);
    lines.push("");
    lines.push(note.content);
    if (note.alarmAt) {
      lines.push("");
      lines.push(`⏰ 鬧鈴：${new Date(note.alarmAt).toLocaleString("zh-TW")}${note.alarmFired ? "（已提醒）" : ""}`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  const md = lines.join("\n");

  return new NextResponse(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="notes-${classId.slice(0, 8)}.md"`,
    },
  });
}
