/**
 * 【管理員：AI 供應商目錄】GET — 給設定 UI 取得「6 家供應商」的靜態資訊
 *
 * 回傳：catalog 內容（顯示名稱、申請 key URL、env 變數對應、預設 model 等）
 *      + 每家當前 env key 是否設好（不回傳 key 內容，只回 boolean）
 *      + 系統當前預設 provider id
 */
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { PROVIDER_CATALOG } from "@/lib/ai-providers/catalog";
import { getAiProvider, hasConfiguredApiKeyFor } from "@/lib/ai-provider";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  const items = PROVIDER_CATALOG.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    shortDescription: p.shortDescription,
    apiKeyConsoleUrl: p.apiKeyConsoleUrl,
    defaultBaseUrl: p.defaultBaseUrl,
    defaultChatModel: p.defaultChatModel,
    defaultPlanningModel: p.defaultPlanningModel ?? null,
    defaultEmbeddingModel: p.defaultEmbeddingModel ?? null,
    envVars: p.envVars,
    freeTierNote: p.freeTierNote ?? null,
    brandColor: p.brandColor,
    apiKeyConfigured: hasConfiguredApiKeyFor(p.id),
  }));

  return NextResponse.json({
    defaultProvider: getAiProvider(),
    items,
  });
}
