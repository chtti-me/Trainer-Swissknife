import "server-only";
import OpenAI from "openai";
import {
  createAiClientFor,
  getAiProvider,
  getModelFor,
  hasConfiguredApiKeyFor,
  type AiFeature,
} from "../ai-provider";
import type { AiProvider } from "../ai-provider-types";
import { loadFallbackConfig, getOrderedActiveChain, type FallbackConfig } from "./settings";
import {
  recordError,
  recordSuccess,
  recordSwitchOut,
  isInCooldown,
  setCooldown,
  getUsage,
} from "./usage-stats";

/**
 * 【AI Fallback Runtime】
 *
 * 讓「同一個 LLM 呼叫」自動依設定鏈嘗試多家供應商。
 *
 * 用法（呼叫端）：
 *   const result = await callWithFallback({
 *     feature: "agent",
 *     run: async ({ client, provider, model }) => {
 *       return await client.chat.completions.create({ model, messages, ... });
 *     },
 *   });
 *   // result.value 是 run 的回傳；result.provider 是實際成功的 provider
 *
 * 行為：
 *   1. 讀 DB 的 fallback chain；若 enabled=false 或 chain 空 → 走系統預設單一 provider（向後相容）
 *   2. 依序嘗試每個 provider（先排「沒在 cool down」的），呼 run()
 *   3. run() 拋錯時：
 *      a. 若錯誤狀態碼 ∈ thresholds.switchOnErrorStatuses → 標記該 provider 進 cool down，繼續下一家
 *      b. 否則拋出（非 quota 類錯誤不該觸發 fallback；例如使用者輸入問題）
 *   4. 若 daily soft limit 命中 → 不打該 provider，直接跳下一家（仍計算這次「pre-emptive switch」）
 *   5. 全部 provider 都失敗 → 拋最後一次錯誤（含「已試過哪幾家」訊息）
 *
 * 注意：
 *   - **streaming** 不適合在「拿到第一個 token 後再切」（會讓使用者看到亂掉的回應）。
 *     `callWithFallbackStream` 處理「建立連線階段」的 fallback，連線成功後就交回 streaming iterator
 *     由呼叫端處理；連線中途斷線不再切換。
 */

export interface RunContext {
  client: OpenAI;
  provider: AiProvider;
  model: string;
  /**
   * Streaming 場景用：呼叫此函數後，後續若 throw 不會再嘗試切換（避免前端看到亂掉的內容）。
   * 建議在「拿到第一個 streaming chunk」或「明確準備往前端 send」之前呼叫。
   * 非 streaming 模式不需要呼叫。
   */
  markCommitted: () => void;
}

export interface CallWithFallbackArgs<T> {
  feature: AiFeature;
  /** 呼叫端 explicit override 的 provider（從 request body / DB 來，非 env） */
  explicitProvider?: AiProvider | null;
  /** 真正執行 LLM 呼叫的 callback */
  run: (ctx: RunContext) => Promise<T>;
  /** 預設不額外 log；想要自訂可傳 logger（會收到 provider switch 事件） */
  onProviderSwitch?: (event: ProviderSwitchEvent) => void;
}

export interface ProviderSwitchEvent {
  feature: AiFeature;
  fromProvider: AiProvider;
  toProvider: AiProvider | null;
  reason: "error_status" | "soft_limit" | "no_api_key" | "exhausted";
  errorStatus?: number;
  errorMessage?: string;
}

export interface CallResult<T> {
  value: T;
  provider: AiProvider;
  /** 試了幾家才成功（≥1） */
  attempts: number;
  /** 是否觸發過切換（=true 表示有 fallback 過） */
  switched: boolean;
}

function extractStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const o = err as { status?: unknown; response?: { status?: unknown } };
  if (typeof o.status === "number") return o.status;
  if (o.response && typeof o.response.status === "number") return o.response.status;
  return undefined;
}

function extractMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err).slice(0, 500);
  } catch {
    return String(err);
  }
}

function shouldSwitchOnError(cfg: FallbackConfig, err: unknown): boolean {
  const status = extractStatus(err);
  if (status === undefined) {
    // 無 status（網路層錯誤、abort）也視為可切（很可能是上游連線問題）
    return true;
  }
  return cfg.thresholds.switchOnErrorStatuses.includes(status);
}

/**
 * 把「explicit + chain + 系統預設」三層併起來，產生「最終要嘗試的 provider 順序」。
 *
 * 邏輯：
 *   - 若 fallback 未啟用（cfg.enabled=false）→ 只有 explicit / 系統預設那一家
 *   - 若 fallback 啟用：先 explicit（若有）→ chain 順序（去重複、去掉 explicit 已試過的）
 *   - 過濾掉「沒設 API key」的 provider（有 key 才嘗試）
 */
function resolveAttemptList(
  cfg: FallbackConfig,
  explicitProvider: AiProvider | null
): AiProvider[] {
  if (!cfg.enabled) {
    const sole = explicitProvider ?? getAiProvider();
    return hasConfiguredApiKeyFor(sole) ? [sole] : [];
  }

  const ordered = getOrderedActiveChain(cfg, isInCooldown);
  const list: AiProvider[] = [];
  if (explicitProvider) list.push(explicitProvider);
  for (const p of ordered) {
    if (!list.includes(p)) list.push(p);
  }
  // 兜底：chain 是空的且沒 explicit → 用系統預設
  if (list.length === 0) {
    const sole = getAiProvider();
    list.push(sole);
  }
  return list.filter((p) => hasConfiguredApiKeyFor(p));
}

export async function callWithFallback<T>(args: CallWithFallbackArgs<T>): Promise<CallResult<T>> {
  const cfg = await loadFallbackConfig();
  const attemptList = resolveAttemptList(cfg, args.explicitProvider ?? null);

  if (attemptList.length === 0) {
    throw new Error(
      "AI 呼叫失敗：目前所有 provider 都未設定 API key。請先在 Render 環境變數設定至少一家供應商的 API key。"
    );
  }

  let lastError: unknown = null;
  let attempts = 0;
  const tried: AiProvider[] = [];

  for (let i = 0; i < attemptList.length; i++) {
    const provider = attemptList[i];
    attempts++;
    tried.push(provider);

    // soft-limit 預警：成功計數已達上限 → 跳過
    const u = getUsage(provider);
    const soft = cfg.thresholds.dailyRequestSoftLimit;
    if (cfg.enabled && soft != null && soft > 0 && u.successCount >= soft) {
      args.onProviderSwitch?.({
        feature: args.feature,
        fromProvider: provider,
        toProvider: attemptList[i + 1] ?? null,
        reason: "soft_limit",
      });
      recordSwitchOut(provider);
      continue;
    }

    let committed = false;
    const ctx: RunContext = {
      client: createAiClientFor(provider),
      provider,
      model: getModelFor(args.feature, provider),
      markCommitted: () => {
        committed = true;
      },
    };

    try {
      const value = await args.run(ctx);
      recordSuccess(provider);
      return {
        value,
        provider,
        attempts,
        switched: i > 0,
      };
    } catch (err) {
      lastError = err;
      const message = extractMessage(err);
      const status = extractStatus(err);
      recordError(provider, `${status ?? "?"} ${message}`);

      // 已 commit（streaming 已開始往前端寫）→ 不再嘗試切換
      if (committed) {
        throw decorateExhaustedError(err, args.feature, tried);
      }

      const canSwitch = cfg.enabled && shouldSwitchOnError(cfg, err);
      if (canSwitch && i < attemptList.length - 1) {
        recordSwitchOut(provider);
        setCooldown(provider, cfg.thresholds.cooldownSeconds);
        args.onProviderSwitch?.({
          feature: args.feature,
          fromProvider: provider,
          toProvider: attemptList[i + 1],
          reason: "error_status",
          errorStatus: status,
          errorMessage: message,
        });
        continue;
      }
      // 不該切，或已經是最後一家 → 拋
      throw decorateExhaustedError(err, args.feature, tried);
    }
  }

  throw decorateExhaustedError(lastError, args.feature, tried);
}

function decorateExhaustedError(err: unknown, feature: AiFeature, tried: AiProvider[]): Error {
  const inner = extractMessage(err) || "(unknown error)";
  const status = extractStatus(err);
  const triedStr = tried.length ? tried.join(" → ") : "(none)";
  const out = new Error(
    `AI 呼叫失敗（feature=${feature}，已嘗試：${triedStr}）：${status ?? "?"} ${inner}`
  );
  // 帶上 status 給上層（例如 agent core 的 formatAgentFatalError 仍可用）
  (out as Error & { status?: number }).status = status;
  return out;
}
