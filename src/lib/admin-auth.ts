/**
 * 【管理員權限檢查】
 * API 路由用：若未登入或非 admin，直接回傳 401／403。
 */
import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function requireAdminSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { session: null, error: NextResponse.json({ error: "未授權" }, { status: 401 }) };
  }
  const role = (session.user as { role?: string }).role;
  if (role !== "admin") {
    return { session: null, error: NextResponse.json({ error: "需要系統管理員權限" }, { status: 403 }) };
  }
  return { session, error: null as null };
}
