/**
 * GET /api/agent/audit-log - 查詢審計日誌（分頁）
 * 支援 ?page=1&limit=50&action=agent_tool
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const userId = (session.user as { id?: string }).id || "";
  const isAdmin = (session.user as { role?: string }).role === "admin";

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
  const actionFilter = url.searchParams.get("action") || "";

  const where: Record<string, unknown> = {};
  if (!isAdmin) {
    where.userId = userId;
  }
  if (actionFilter) {
    where.action = { startsWith: actionFilter };
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return NextResponse.json({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    logs: logs.map((log) => ({
      id: log.id,
      userId: log.userId,
      action: log.action,
      target: log.target,
      detail: log.detail,
      agentConversationId: log.agentConversationId,
      createdAt: log.createdAt.toISOString(),
    })),
  });
}
