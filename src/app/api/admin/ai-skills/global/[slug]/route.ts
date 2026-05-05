/**
 * 【管理員：單一全院技能】GET 詳情（含版本列）、PATCH 更新標題／排序。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { invalidateSkillContextCache } from "@/lib/ai-skills";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const { slug: raw } = await ctx.params;
  const slug = decodeURIComponent(raw).toLowerCase();

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
    toolBinding: def.toolBinding,
    triggerCondition: def.triggerCondition,
    versions: def.versions.map((v) => ({
      versionNo: v.versionNo,
      createdAt: v.createdAt.toISOString(),
      content: v.content,
    })),
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const { slug: raw } = await ctx.params;
  const slug = decodeURIComponent(raw).toLowerCase();

  let body: { title?: string; sortOrder?: number; toolBinding?: string | null; triggerCondition?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "無效的 JSON" }, { status: 400 });
  }

  const def = await prisma.aiGlobalSkillDefinition.findUnique({ where: { slug } });
  if (!def) {
    return NextResponse.json({ error: "找不到此技能" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;
  if (body.toolBinding !== undefined) data.toolBinding = body.toolBinding;
  if (body.triggerCondition !== undefined) data.triggerCondition = body.triggerCondition;

  await prisma.aiGlobalSkillDefinition.update({ where: { slug }, data });
  invalidateSkillContextCache();

  return NextResponse.json({ ok: true });
}
