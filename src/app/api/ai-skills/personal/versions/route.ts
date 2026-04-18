/**
 * 【個人 AI 技能脈絡】POST：新增版本（新內容或自舊版還原為新版本）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureTrainerSkillDefinition, nextTrainerSkillVersionNo } from "@/lib/ai-skills";
import { assertSkillContentWithinLimit } from "@/lib/ai-skill-limits";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const userId = (session.user as { id?: string }).id;
  if (!userId) {
    return NextResponse.json({ error: "無法取得使用者" }, { status: 401 });
  }

  let body: { content?: string; restoreFromVersionNo?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "無效的 JSON" }, { status: 400 });
  }

  const def = await ensureTrainerSkillDefinition(userId);

  let content: string;
  if (typeof body.restoreFromVersionNo === "number") {
    const src = await prisma.aiTrainerSkillVersion.findUnique({
      where: {
        definitionId_versionNo: {
          definitionId: def.id,
          versionNo: body.restoreFromVersionNo,
        },
      },
    });
    if (!src) {
      return NextResponse.json({ error: "指定的版本不存在" }, { status: 400 });
    }
    content = src.content;
  } else if (typeof body.content === "string") {
    try {
      assertSkillContentWithinLimit(body.content);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
    content = body.content;
  } else {
    return NextResponse.json({ error: "請提供 content 或 restoreFromVersionNo" }, { status: 400 });
  }

  const versionNo = await nextTrainerSkillVersionNo(def.id);
  const row = await prisma.aiTrainerSkillVersion.create({
    data: {
      definitionId: def.id,
      content,
      versionNo,
    },
  });

  return NextResponse.json({
    versionNo: row.versionNo,
    createdAt: row.createdAt.toISOString(),
  });
}
