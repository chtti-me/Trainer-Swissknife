/**
 * 【全院 AI 技能】GET：單一 slug 之詳情與版本列（唯讀）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const { slug: raw } = await ctx.params;
  const slug = decodeURIComponent(raw).toLowerCase();

  try {
    const def = await prisma.aiGlobalSkillDefinition.findUnique({
      where: { slug },
      include: {
        versions: { orderBy: { versionNo: "desc" } },
      },
    });

    if (!def) {
      return NextResponse.json({ error: "找不到此技能" }, { status: 404 });
    }

    return NextResponse.json({
      slug: def.slug,
      title: def.title,
      sortOrder: def.sortOrder,
      versions: def.versions.map((v) => ({
        versionNo: v.versionNo,
        createdAt: v.createdAt.toISOString(),
        content: v.content,
      })),
    });
  } catch (e) {
    console.error("[GET /api/ai-skills/global/[slug]]", e);
    return NextResponse.json({ error: "讀取技能失敗" }, { status: 500 });
  }
}
