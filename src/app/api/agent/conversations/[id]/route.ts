/**
 * GET /api/agent/conversations/[id] - 取得對話詳情（含訊息）
 * DELETE /api/agent/conversations/[id] - 刪除對話
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getConversation,
  loadAllMessages,
  deleteConversation,
} from "@/lib/agent/history";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const userId = (session.user as { id?: string }).id || "";
  const { id } = await params;

  const conv = await getConversation(id, userId);
  if (!conv) {
    return NextResponse.json({ error: "對話不存在" }, { status: 404 });
  }

  const messages = await loadAllMessages(id);
  return NextResponse.json({
    id: conv.id,
    title: conv.title,
    status: conv.status,
    createdAt: conv.createdAt.toISOString(),
    updatedAt: conv.updatedAt.toISOString(),
    messages,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const userId = (session.user as { id?: string }).id || "";
  const { id } = await params;

  const conv = await getConversation(id, userId);
  if (!conv) {
    return NextResponse.json({ error: "對話不存在" }, { status: 404 });
  }

  await deleteConversation(id);
  return NextResponse.json({ success: true });
}
