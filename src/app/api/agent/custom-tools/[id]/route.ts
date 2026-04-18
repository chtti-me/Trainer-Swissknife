/**
 * PUT /api/agent/custom-tools/[id] - 更新自定義工具
 * DELETE /api/agent/custom-tools/[id] - 刪除自定義工具
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function authorize(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: "未授權", status: 401 } as const;

  const userId = (session.user as { id?: string }).id || "";
  const tool = await prisma.customTool.findUnique({ where: { id } });

  if (!tool) return { error: "工具不存在", status: 404 } as const;
  if (tool.userId !== userId) return { error: "無權限", status: 403 } as const;

  return { tool, userId } as const;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await authorize(id);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const body = (await req.json()) as {
    description?: string;
    endpointUrl?: string;
    inputSchema?: string;
    headers?: string | null;
    isActive?: boolean;
  };

  const data: Record<string, unknown> = {};
  if (body.description !== undefined) data.description = String(body.description).trim();
  if (body.endpointUrl !== undefined) {
    const url = String(body.endpointUrl).trim();
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "端點 URL 格式不正確" }, { status: 400 });
    }
    data.endpointUrl = url;
  }
  if (body.inputSchema !== undefined) {
    try {
      JSON.parse(body.inputSchema);
    } catch {
      return NextResponse.json({ error: "輸入 Schema 須為合法 JSON" }, { status: 400 });
    }
    data.inputSchema = body.inputSchema;
  }
  if (body.headers !== undefined) data.headers = body.headers;
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  const updated = await prisma.customTool.update({ where: { id }, data });
  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    description: updated.description,
    endpointUrl: updated.endpointUrl,
    inputSchema: updated.inputSchema,
    isActive: updated.isActive,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await authorize(id);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  await prisma.customTool.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
