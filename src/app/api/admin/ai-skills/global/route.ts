/**
 * 【管理員：全院 AI 技能定義】GET 列表、POST 新增 slug。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { assertValidSkillSlug, invalidateSkillContextCache } from "@/lib/ai-skills";
import { assertSkillContentWithinLimit } from "@/lib/ai-skill-limits";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const defs = await prisma.aiGlobalSkillDefinition.findMany({
      orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
      include: {
        versions: { orderBy: { versionNo: "desc" } },
      },
    });

    const payload = defs.map((d) => {
      const latest = d.versions[0];
      return {
        slug: d.slug,
        title: d.title,
        sortOrder: d.sortOrder,
        toolBinding: d.toolBinding,
        triggerCondition: d.triggerCondition,
        versionCount: d.versions.length,
        latestVersionNo: latest?.versionNo ?? null,
        latestCreatedAt: latest?.createdAt?.toISOString() ?? null,
        latestContentPreview: latest?.content ? latest.content.slice(0, 160) : "",
      };
    });

    return NextResponse.json(payload);
  } catch (e) {
    console.error("[GET /api/admin/ai-skills/global]", e);
    return NextResponse.json({ error: "讀取全院技能清單失敗" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  let body: { slug?: string; title?: string; sortOrder?: number; initialContent?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "無效的 JSON" }, { status: 400 });
  }

  const slug = (body.slug || "").trim().toLowerCase();
  const title = (body.title || "").trim();
  if (!slug || !title) {
    return NextResponse.json({ error: "請提供「內部代號」與「顯示標題」" }, { status: 400 });
  }

  try {
    assertValidSkillSlug(slug);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const initialRaw = typeof body.initialContent === "string" ? body.initialContent : "";
  try {
    assertSkillContentWithinLimit(initialRaw);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const exists = await prisma.aiGlobalSkillDefinition.findUnique({ where: { slug } });
  if (exists) {
    return NextResponse.json({ error: "此內部代號已被使用（程式識別鍵 slug 重複）" }, { status: 409 });
  }

  const def = await prisma.aiGlobalSkillDefinition.create({
    data: {
      slug,
      title,
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
    },
  });

  const content = initialRaw;
  await prisma.aiGlobalSkillVersion.create({
    data: {
      definitionId: def.id,
      content,
      versionNo: 1,
    },
  });
  invalidateSkillContextCache();

  return NextResponse.json({ slug: def.slug, title: def.title, sortOrder: def.sortOrder });
}
