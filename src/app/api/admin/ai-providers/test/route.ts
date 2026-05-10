/**
 * 【管理員：AI 供應商測試】POST — 用「使用者輸入的 key」測試 provider，並回模型清單
 *
 * Body:
 *   { provider: "gemini" | "openai" | ...; apiKey: string }
 *
 * 行為：
 *   - 完全 ad-hoc：不會把 key 寫入 env、不會儲存到 DB
 *   - 純粹拿這把 key 去打 catalog 中該 provider 的 list-models endpoint
 *   - 成功 → 回 200 + 模型陣列
 *   - 失敗 → 回 200 + ok:false + error message（不回 4xx，避免 UI 處理太繁瑣）
 *
 * ⚠️ 此路由會接觸到「正在輸入測試的 API key」，不會 log key 內容；只 log provider id 與成功/失敗。
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { isAiProvider } from "@/lib/ai-provider-types";
import { getProviderCatalog } from "@/lib/ai-providers/catalog";
import { listModelsForProvider } from "@/lib/ai-providers/list-models";

interface Body {
  provider?: unknown;
  apiKey?: unknown;
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Body 不是合法 JSON" }, { status: 400 });
  }

  const provider = typeof body.provider === "string" ? body.provider : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";

  if (!isAiProvider(provider)) {
    return NextResponse.json({ ok: false, error: "不支援的 provider" }, { status: 400 });
  }
  if (!apiKey || apiKey.length < 8) {
    return NextResponse.json({ ok: false, error: "請提供有效 API key" }, { status: 400 });
  }

  const cat = getProviderCatalog(provider);
  if (!cat) {
    return NextResponse.json({ ok: false, error: "找不到 provider catalog" }, { status: 400 });
  }

  const result = await listModelsForProvider(provider, apiKey);

  console.log(
    `[ai-providers/test] provider=${provider} ok=${result.ok} models=${result.models.length} status=${
      result.status ?? "-"
    }`
  );

  return NextResponse.json({
    ok: result.ok,
    error: result.error ?? null,
    status: result.status ?? null,
    provider,
    catalog: {
      defaultBaseUrl: cat.defaultBaseUrl,
      defaultChatModel: cat.defaultChatModel,
      envVarApiKey: cat.envVars.apiKey,
      envVarBaseUrl: cat.envVars.baseUrl,
      envVarChatModel: cat.envVars.chatModel,
    },
    models: result.models,
  });
}
