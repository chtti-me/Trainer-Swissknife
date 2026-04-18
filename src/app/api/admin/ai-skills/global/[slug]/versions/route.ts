/**
 * 【管理員：全院技能新版本】POST：直接存新內容，或自舊版複製成新版本。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { nextGlobalSkillVersionNo } from "@/lib/ai-skills";
import { assertSkillContentWithinLimit } from "@/lib/ai-skill-limits";

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const { slug: raw } = await ctx.params;
  const slug = decodeURIComponent(raw).toLowerCase();

  let body: { content?: string; restoreFromVersionNo?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "無效的 JSON" }, { status: 400 });
  }

  const def = await prisma.aiGlobalSkillDefinition.findUnique({ where: { slug } });
  if (!def) {
    return NextResponse.json({ error: "找不到此技能" }, { status: 404 });
  }

  let content: string;
  if (typeof body.restoreFromVersionNo === "number") {
    const src = await prisma.aiGlobalSkillVersion.findUnique({
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

  const versionNo = await nextGlobalSkillVersionNo(def.id);
  const row = await prisma.aiGlobalSkillVersion.create({
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
