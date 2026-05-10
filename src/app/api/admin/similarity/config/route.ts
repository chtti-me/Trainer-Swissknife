/**
 * 【管理員：相似度檢測設定】GET / PUT
 *
 * GET：回傳目前生效的 SimilarityConfig（含 5 個參數）
 * PUT：admin 提交新設定，validate + upsert + invalidate cache
 *
 * UI 端見 src/components/settings/similarity-settings.tsx
 * Service 邏輯見 src/lib/similarity-settings.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import {
  buildDefaultSimilarityConfig,
  loadSimilarityConfig,
  resetSimilarityConfig,
  saveSimilarityConfig,
  type SimilarityConfig,
} from "@/lib/similarity-settings";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  const config = await loadSimilarityConfig();
  return NextResponse.json({
    config,
    defaults: buildDefaultSimilarityConfig(),
  });
}

export async function PUT(req: NextRequest) {
  const { session, error } = await requireAdminSession();
  if (error) return error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "payload 非合法 JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "payload 必須為物件" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;

  // 「重置為預設」捷徑：reset=true 直接套程式預設值
  if (o.reset === true) {
    const reset = await resetSimilarityConfig((session?.user as { id?: string })?.id ?? null);
    return NextResponse.json({ config: reset, message: "已重置為預設值" });
  }

  // 一般儲存：欄位皆 optional，由 saveSimilarityConfig 內 normalize/clamp
  const input: SimilarityConfig = {
    defaultThreshold: typeof o.defaultThreshold === "number" ? o.defaultThreshold : 0.75,
    lexicalWeight: typeof o.lexicalWeight === "number" ? o.lexicalWeight : 0.4,
    vectorWeight: typeof o.vectorWeight === "number" ? o.vectorWeight : 0.6,
    reuseThreshold: typeof o.reuseThreshold === "number" ? o.reuseThreshold : 0.85,
    referenceThreshold: typeof o.referenceThreshold === "number" ? o.referenceThreshold : 0.65,
  };

  const saved = await saveSimilarityConfig(input, (session?.user as { id?: string })?.id ?? null);
  return NextResponse.json({ config: saved, message: "已儲存" });
}
