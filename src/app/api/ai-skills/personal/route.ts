/**
 * 【個人 AI 技能脈絡】GET：定義與全部版本（培訓師／管理員皆可讀自己的）。
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureTrainerSkillDefinition } from "@/lib/ai-skills";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const userId = (session.user as { id?: string }).id;
  if (!userId) {
    return NextResponse.json({ error: "無法取得使用者" }, { status: 401 });
  }

  const def = await ensureTrainerSkillDefinition(userId);
  const versions = await prisma.aiTrainerSkillVersion.findMany({
    where: { definitionId: def.id },
    orderBy: { versionNo: "desc" },
  });

  return NextResponse.json({
    title: def.title,
    definitionId: def.id,
    versions: versions.map((v) => ({
      versionNo: v.versionNo,
      createdAt: v.createdAt.toISOString(),
      content: v.content,
    })),
  });
}
