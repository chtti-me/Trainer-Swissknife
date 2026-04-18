/**
 * PUT /api/agent/rules/[id] - 更新規則
 * DELETE /api/agent/rules/[id] - 刪除規則
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getSessionAndRule(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: "未授權", status: 401 } as const;

  const userId = (session.user as { id?: string }).id || "";
  const isAdmin = (session.user as { role?: string }).role === "admin";

  const rule = await prisma.agentRule.findUnique({ where: { id } });
  if (!rule) return { error: "規則不存在", status: 404 } as const;

  const canEdit = isAdmin || rule.createdBy === userId;
  if (!canEdit) return { error: "無權限編輯此規則", status: 403 } as const;

  return { session, userId, isAdmin, rule } as const;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getSessionAndRule(id);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const body = (await req.json()) as {
    title?: string;
    content?: string;
    isActive?: boolean;
    priority?: number;
    scope?: string;
  };

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = String(body.title).trim();
  if (body.content !== undefined) data.content = String(body.content).trim();
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  if (body.priority !== undefined) data.priority = Number(body.priority) || 0;

  if (body.scope !== undefined) {
    if (body.scope === "global" && !ctx.isAdmin) {
      return NextResponse.json({ error: "僅系統管理員可設定全院範圍" }, { status: 403 });
    }
    data.scope = body.scope === "global" ? "global" : "user";
  }

  if (data.title === "") {
    return NextResponse.json({ error: "標題不得為空" }, { status: 400 });
  }
  if (data.content === "") {
    return NextResponse.json({ error: "內容不得為空" }, { status: 400 });
  }

  const updated = await prisma.agentRule.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getSessionAndRule(id);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  await prisma.agentRule.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
