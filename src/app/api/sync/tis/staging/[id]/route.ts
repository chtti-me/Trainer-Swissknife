/**
 * 【TIS Staging 取出】GET /api/sync/tis/staging/[id]
 *
 * 給 /sync 頁面用：當 URL 帶 ?tisStagingId=xxx 時，先 GET 這支 API 取出
 * bookmarklet 暫存的 HTML 列表，再包成 multipart 走原本的 /api/sync/tis/ingest 流程。
 *
 * 安全：
 *   - 必須登入
 *   - 只有原 createdBy 能看（staging 帶機敏 TIS 資料）
 *   - 過期的 staging 直接 410 Gone
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface StagingPayload {
  items?: Array<{ name?: string; content?: string; sizeKb?: number }>;
  ua?: string | null;
  sourceUrl?: string | null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }
  const userId = (session.user as { id?: string }).id;
  if (!userId) {
    return NextResponse.json({ error: "Session 缺少 user id" }, { status: 401 });
  }

  const { id } = await params;
  if (!id || id.length < 8) {
    return NextResponse.json({ error: "無效的 staging id" }, { status: 400 });
  }

  const row = await prisma.tisIngestStaging.findUnique({ where: { id } });
  if (!row) {
    return NextResponse.json({ error: "找不到此 staging（可能已過期被清除）" }, { status: 404 });
  }
  if (row.createdBy !== userId) {
    return NextResponse.json({ error: "沒有存取權限" }, { status: 403 });
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Staging 已過期，請重新從 TIS 點書籤" }, { status: 410 });
  }

  const payload = row.payload as unknown as StagingPayload;
  const items = (payload.items ?? [])
    .filter((it): it is { name?: string; content: string; sizeKb?: number } =>
      typeof it?.content === "string" && it.content.length > 0
    )
    .map((it) => ({
      name: typeof it.name === "string" ? it.name : "(unnamed)",
      content: it.content,
      sizeKb: typeof it.sizeKb === "number" ? it.sizeKb : Math.ceil(it.content.length / 1024),
    }));

  return NextResponse.json({
    id: row.id,
    itemCount: row.itemCount,
    totalKb: row.totalKb,
    consumed: row.consumed,
    consumedAt: row.consumedAt,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    sourceUrl: payload.sourceUrl ?? null,
    ua: payload.ua ?? null,
    items, // 含 HTML 內容；回給 /sync 頁面直接送 ingest API
  });
}

/**
 * 標記 consumed（confirm 完成後 /sync 頁面呼叫，方便日後審計與清理）
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }
  const userId = (session.user as { id?: string }).id;
  if (!userId) {
    return NextResponse.json({ error: "Session 缺少 user id" }, { status: 401 });
  }

  const { id } = await params;
  const row = await prisma.tisIngestStaging.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "找不到 staging" }, { status: 404 });
  if (row.createdBy !== userId) {
    return NextResponse.json({ error: "沒有存取權限" }, { status: 403 });
  }

  await prisma.tisIngestStaging.update({
    where: { id },
    data: { consumed: true, consumedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
