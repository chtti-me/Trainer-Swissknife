/**
 * GET /api/agent/rules - 列出 Agent 規則
 * POST /api/agent/rules - 新增規則
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const userId = (session.user as { id?: string }).id || "";
  const isAdmin = (session.user as { role?: string }).role === "admin";

  const rules = await prisma.agentRule.findMany({
    where: {
      OR: [
        { scope: "global" },
        { scope: "user", createdBy: userId },
      ],
    },
    orderBy: [{ priority: "desc" }, { slug: "asc" }],
  });

  return NextResponse.json(
    rules.map((r) => ({
      ...r,
      canEdit: isAdmin || r.createdBy === userId,
    }))
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const userId = (session.user as { id?: string }).id || "";
  const isAdmin = (session.user as { role?: string }).role === "admin";

  const body = (await req.json()) as {
    slug?: string;
    title?: string;
    content?: string;
    scope?: string;
    priority?: number;
  };

  const slug = String(body.slug || "").trim();
  const title = String(body.title || "").trim();
  const content = String(body.content || "").trim();
  const scope = body.scope === "global" ? "global" : "user";
  const priority = Number(body.priority) || 0;

  if (!slug || !title || !content) {
    return NextResponse.json({ error: "slug、標題與內容皆為必填" }, { status: 400 });
  }

  if (!/^[a-z][a-z0-9_]{0,63}$/.test(slug)) {
    return NextResponse.json(
      { error: "slug 須為小寫英文數字底線，以英文開頭，長度 1-64" },
      { status: 400 }
    );
  }

  if (scope === "global" && !isAdmin) {
    return NextResponse.json({ error: "僅系統管理員可建立全院規則" }, { status: 403 });
  }

  const existing = await prisma.agentRule.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: `slug「${slug}」已存在` }, { status: 409 });
  }

  const rule = await prisma.agentRule.create({
    data: { slug, title, content, scope, priority, createdBy: userId },
  });

  return NextResponse.json(rule, { status: 201 });
}
