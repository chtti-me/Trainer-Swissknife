/**
 * 【健康檢查端點】GET /api/health
 *
 * Render 的 healthCheckPath 會定期 GET 這支來判斷服務是否健康。
 * 同時順便檢查 DB 連線（避免「服務活著但資料庫掛了」這種狀況）。
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  let dbOk = false;
  let pgvectorOk = false;
  let error: string | undefined;

  try {
    await prisma.$queryRawUnsafe(`SELECT 1`);
    dbOk = true;
    const ext = await prisma.$queryRawUnsafe<Array<{ installed_version: string | null }>>(
      `SELECT installed_version FROM pg_available_extensions WHERE name = 'vector'`
    );
    pgvectorOk = Boolean(ext[0]?.installed_version);
  } catch (e) {
    error = (e as Error).message;
  }

  const status = dbOk ? 200 : 503;
  return NextResponse.json(
    {
      ok: dbOk,
      version: process.env.APP_VERSION || "v4.0",
      checks: {
        db: dbOk,
        pgvector: pgvectorOk,
      },
      latencyMs: Date.now() - startedAt,
      ...(error ? { error } : {}),
    },
    { status }
  );
}
