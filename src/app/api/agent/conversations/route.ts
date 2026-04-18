/**
 * GET /api/agent/conversations - 列出使用者對話
 * POST /api/agent/conversations - 建立新對話
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listConversations, createConversation } from "@/lib/agent/history";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const userId = (session.user as { id?: string }).id || "";
  const conversations = await listConversations(userId);
  return NextResponse.json(conversations);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const userId = (session.user as { id?: string }).id || "";
  const body = (await req.json().catch(() => ({}))) as { title?: string };

  const conv = await createConversation(userId, body.title);
  return NextResponse.json({
    id: conv.id,
    title: conv.title,
    status: conv.status,
    createdAt: conv.createdAt.toISOString(),
    updatedAt: conv.updatedAt.toISOString(),
  });
}
