/**
 * GET /api/agent/custom-tools - 列出使用者的自定義工具
 * POST /api/agent/custom-tools - 新增自定義工具
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

  const tools = await prisma.customTool.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    tools.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      endpointUrl: t.endpointUrl,
      inputSchema: t.inputSchema,
      isActive: t.isActive,
      createdAt: t.createdAt.toISOString(),
    }))
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const userId = (session.user as { id?: string }).id || "";

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    endpointUrl?: string;
    inputSchema?: string;
    headers?: string;
  };

  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const endpointUrl = String(body.endpointUrl || "").trim();
  const inputSchema = String(body.inputSchema || "{}").trim();

  if (!name || !description || !endpointUrl) {
    return NextResponse.json({ error: "名稱、描述、端點 URL 皆為必填" }, { status: 400 });
  }

  if (!/^[a-z][a-z0-9_]{0,63}$/.test(name)) {
    return NextResponse.json(
      { error: "名稱須為小寫英文數字底線，以英文開頭，長度 1-64" },
      { status: 400 }
    );
  }

  try {
    JSON.parse(inputSchema);
  } catch {
    return NextResponse.json({ error: "輸入 Schema 須為合法 JSON" }, { status: 400 });
  }

  try {
    new URL(endpointUrl);
  } catch {
    return NextResponse.json({ error: "端點 URL 格式不正確" }, { status: 400 });
  }

  const existing = await prisma.customTool.findUnique({
    where: { userId_name: { userId, name } },
  });
  if (existing) {
    return NextResponse.json({ error: `工具名稱「${name}」已存在` }, { status: 409 });
  }

  const tool = await prisma.customTool.create({
    data: {
      userId,
      name,
      description,
      endpointUrl,
      inputSchema,
      headers: body.headers || null,
    },
  });

  return NextResponse.json(
    {
      id: tool.id,
      name: tool.name,
      description: tool.description,
      endpointUrl: tool.endpointUrl,
      inputSchema: tool.inputSchema,
      isActive: tool.isActive,
    },
    { status: 201 }
  );
}
