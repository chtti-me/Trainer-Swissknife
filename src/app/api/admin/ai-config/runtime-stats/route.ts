/**
 * 【管理員：AI Fallback 即時統計】GET
 *
 * 回傳今日（UTC）每個 provider 的：成功/錯誤/被切出次數、最後一次成功/錯誤時間、cool down 狀態
 *   - 純記憶體統計，server 重啟會清空（本來就是「即時」性質）
 *   - 給 UI 「fallback 狀態小卡」用
 */
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { snapshotAllUsage } from "@/lib/ai-providers/usage-stats";
import { loadFallbackConfig } from "@/lib/ai-providers/settings";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  const usage = snapshotAllUsage();
  const cfg = await loadFallbackConfig();
  return NextResponse.json({
    fallbackEnabled: cfg.enabled,
    chain: cfg.chain,
    usage,
    serverTime: new Date().toISOString(),
  });
}
