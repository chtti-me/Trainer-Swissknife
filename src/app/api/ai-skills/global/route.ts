/**
 * 【全院 AI 技能】GET：已登入之培訓師／管理員皆可讀取清單（唯讀，不含管理操作）。
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

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
        versionCount: d.versions.length,
        latestVersionNo: latest?.versionNo ?? null,
        latestCreatedAt: latest?.createdAt?.toISOString() ?? null,
        latestContentPreview: latest?.content ? latest.content.slice(0, 160) : "",
      };
    });

    return NextResponse.json(payload);
  } catch (e) {
    console.error("[GET /api/ai-skills/global]", e);
    return NextResponse.json({ error: "讀取全院技能清單失敗" }, { status: 500 });
  }
}
