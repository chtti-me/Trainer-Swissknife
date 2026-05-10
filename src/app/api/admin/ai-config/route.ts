/**
 * 【管理員：AI Fallback 設定】GET / PUT
 *
 * GET — 讀目前 fallback chain 與 thresholds
 * PUT — 寫入新設定（會立刻 invalidate cache，下一次 LLM 呼叫即生效）
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import {
  buildDefaultFallbackConfig,
  loadFallbackConfig,
  saveFallbackConfig,
  type FallbackConfig,
  type FallbackChainEntry,
  type FallbackThresholds,
} from "@/lib/ai-providers/settings";
import { isAiProvider } from "@/lib/ai-provider-types";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  const cfg = await loadFallbackConfig();
  return NextResponse.json(cfg);
}

interface PutBody {
  enabled?: unknown;
  chain?: unknown;
  thresholds?: unknown;
}

function parseChain(raw: unknown, fallback: FallbackChainEntry[]): FallbackChainEntry[] {
  if (!Array.isArray(raw)) return fallback;
  const out: FallbackChainEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (!isAiProvider(o.provider)) continue;
    out.push({
      provider: o.provider,
      enabled: typeof o.enabled === "boolean" ? o.enabled : false,
    });
  }
  // 若解析後是空，回 fallback 避免管理員不小心傳空陣列把整個 chain 清掉
  return out.length > 0 ? out : fallback;
}

function parseThresholds(raw: unknown, fallback: FallbackThresholds): FallbackThresholds {
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  const dailyRequestSoftLimit =
    o.dailyRequestSoftLimit === null
      ? null
      : typeof o.dailyRequestSoftLimit === "number" && Number.isFinite(o.dailyRequestSoftLimit)
      ? Math.max(0, Math.floor(o.dailyRequestSoftLimit))
      : fallback.dailyRequestSoftLimit;
  const switchOnErrorStatuses = Array.isArray(o.switchOnErrorStatuses)
    ? (o.switchOnErrorStatuses.filter((n: unknown) => typeof n === "number" && n > 0) as number[])
    : fallback.switchOnErrorStatuses;
  const consecutiveErrorThreshold =
    typeof o.consecutiveErrorThreshold === "number"
      ? Math.max(1, Math.floor(o.consecutiveErrorThreshold))
      : fallback.consecutiveErrorThreshold;
  const cooldownSeconds =
    typeof o.cooldownSeconds === "number"
      ? Math.max(0, Math.floor(o.cooldownSeconds))
      : fallback.cooldownSeconds;
  return {
    dailyRequestSoftLimit,
    switchOnErrorStatuses,
    consecutiveErrorThreshold,
    cooldownSeconds,
  };
}

export async function PUT(req: NextRequest) {
  const { session, error } = await requireAdminSession();
  if (error) return error;

  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "Body 不是合法 JSON" }, { status: 400 });
  }

  const def = buildDefaultFallbackConfig();
  const next: FallbackConfig = {
    enabled: typeof body.enabled === "boolean" ? body.enabled : def.enabled,
    chain: parseChain(body.chain, def.chain),
    thresholds: parseThresholds(body.thresholds, def.thresholds),
  };

  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const saved = await saveFallbackConfig(next, userId);
  return NextResponse.json(saved);
}
