import "server-only";
import { prisma } from "@/lib/prisma";
import { isAiProvider, type AiProvider } from "../ai-provider-types";
import { PROVIDER_CATALOG } from "./catalog";

/**
 * 【AI Fallback 設定 — DB 持久化層】
 *
 * 設計：
 *   - 所有「需要管理員 UI 即時調整」的 AI 路由設定，存在 AppSetting 表的 key="ai.fallbackChain" 下
 *   - 這支模組負責 read / write / cache，不負責「執行」
 *   - 同進程 30s in-memory cache（避免每次 LLM 呼叫都打 DB）
 */

export const AI_FALLBACK_SETTING_KEY = "ai.fallbackChain";

export interface FallbackChainEntry {
  /** 該 provider 的識別字（必須是 valid AiProvider） */
  provider: AiProvider;
  /** 是否啟用本項（false 等同從 chain 移除，但保留 UI 順序） */
  enabled: boolean;
}

export interface FallbackThresholds {
  /**
   * 同一 provider 的「每日成功請求數」達到本值就主動切下一家。
   * 0 或 null 表示「不依次數主動切換」。
   */
  dailyRequestSoftLimit: number | null;
  /**
   * 觸發即時切換的錯誤狀態碼集合。
   * 各 status code 的實際語意（依實測）：
   *   400 — Gemini 配額用光時回 400 (no body)，且常見於 schema mismatch
   *   402 — OpenRouter 用此狀態碼回「daily free tier quota exceeded」
   *   408 — Request Timeout
   *   409 — Conflict（部分供應商用作軟性 rate-limit）
   *   413 — Payload Too Large；Groq free tier 用此回「TPM 超限」（Tokens Per Minute）
   *   425 — Too Early
   *   429 — 標準 Rate Limit Exceeded
   *   451 — Unavailable For Legal Reasons（地理限制；少見但會用）
   *   500/502/503/504 — 上游 5xx，全當暫時故障切換
   */
  switchOnErrorStatuses: number[];
  /** 連續 N 次錯誤後才切（預設 1，表示第一次就切） */
  consecutiveErrorThreshold: number;
  /** 切出後的 cool down 秒數（不再嘗試該 provider）。預設 600s（10 分） */
  cooldownSeconds: number;
}

export interface FallbackConfig {
  /** 是否啟用 fallback runtime；false → 永遠走系統預設單一 provider，等同舊行為 */
  enabled: boolean;
  /** 順序由前到後：第一個 enabled 的當主，依序往下 fallback */
  chain: FallbackChainEntry[];
  thresholds: FallbackThresholds;
}

export const DEFAULT_FALLBACK_THRESHOLDS: FallbackThresholds = {
  dailyRequestSoftLimit: null,
  switchOnErrorStatuses: [400, 402, 404, 408, 409, 413, 425, 429, 451, 500, 502, 503, 504],
  consecutiveErrorThreshold: 1,
  cooldownSeconds: 600,
};

/**
 * 「為了 fallback 行為合理性，這幾個 status code 必須一直在 list 裡」的最小集合。
 * parseFallbackConfig() 會對既有 DB 紀錄做向前相容 merge，避免使用者必須回 UI 重存設定。
 *
 * 為什麼要 merge：DB 裡可能存著一年前舊版本存的清單（沒有 402/413/451），
 * 若不 merge，使用者還是會踩到「Groq 413 TPM 超限不切」的舊 bug。
 */
const REQUIRED_SWITCH_STATUSES = [400, 402, 404, 413, 429, 502, 503, 504] as const;

/** 預設 chain：有 catalog enabledByDefault 為 true 的優先（目前只有 Gemini） */
export function buildDefaultFallbackConfig(): FallbackConfig {
  const chain: FallbackChainEntry[] = PROVIDER_CATALOG.map((p) => ({
    provider: p.id,
    enabled: p.enabledByDefault,
  }));
  return {
    enabled: false,
    chain,
    thresholds: { ...DEFAULT_FALLBACK_THRESHOLDS },
  };
}

function isFallbackChainEntry(v: unknown): v is FallbackChainEntry {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return isAiProvider(o.provider) && typeof o.enabled === "boolean";
}

function isFallbackThresholds(v: unknown): v is FallbackThresholds {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (!(o.dailyRequestSoftLimit === null || typeof o.dailyRequestSoftLimit === "number")) return false;
  if (!Array.isArray(o.switchOnErrorStatuses)) return false;
  if (typeof o.consecutiveErrorThreshold !== "number") return false;
  if (typeof o.cooldownSeconds !== "number") return false;
  return true;
}

function parseFallbackConfig(raw: unknown): FallbackConfig {
  const def = buildDefaultFallbackConfig();
  if (!raw || typeof raw !== "object") return def;
  const o = raw as Record<string, unknown>;

  const enabled = typeof o.enabled === "boolean" ? o.enabled : def.enabled;

  let chain = def.chain;
  if (Array.isArray(o.chain)) {
    const valid = o.chain.filter(isFallbackChainEntry);
    if (valid.length > 0) {
      // 補齊：catalog 有但 raw 沒的 provider，預設 disabled 排在後面
      const seen = new Set(valid.map((e) => e.provider));
      const missing = def.chain
        .filter((e) => !seen.has(e.provider))
        .map((e) => ({ ...e, enabled: false }));
      chain = [...valid, ...missing];
    }
  }

  let thresholds: FallbackThresholds = def.thresholds;
  if (isFallbackThresholds(o.thresholds)) {
    const fromDb = o.thresholds.switchOnErrorStatuses.filter(
      (n: unknown): n is number => typeof n === "number"
    );
    // 向前相容 merge：把 REQUIRED_SWITCH_STATUSES 中缺少的補進去，避免舊紀錄仍踩到
    // 「Groq 413 TPM 超限不切」「OpenRouter 402 daily free quota 用光不切」等已知雷。
    // 若使用者真的想關掉某個 code，他可以在 UI 移除「不在 REQUIRED 內」的；REQUIRED 內
    // 的視為「為了系統運作合理性必須保留」。
    const merged = Array.from(
      new Set<number>([...fromDb, ...REQUIRED_SWITCH_STATUSES])
    ).sort((a, b) => a - b);
    thresholds = {
      dailyRequestSoftLimit: o.thresholds.dailyRequestSoftLimit,
      switchOnErrorStatuses: merged,
      consecutiveErrorThreshold: Math.max(1, Math.floor(o.thresholds.consecutiveErrorThreshold)),
      cooldownSeconds: Math.max(0, Math.floor(o.thresholds.cooldownSeconds)),
    };
  }

  return { enabled, chain, thresholds };
}

interface CacheCell {
  value: FallbackConfig;
  expiresAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __aiFallbackConfigCache: CacheCell | undefined;
}

const CACHE_TTL_MS = 30_000;

/**
 * 讀取目前 fallback 設定（30s in-memory cache）。
 * 找不到 / 解析失敗 → 回 `buildDefaultFallbackConfig()`。
 */
export async function loadFallbackConfig(): Promise<FallbackConfig> {
  const now = Date.now();
  const cached = globalThis.__aiFallbackConfigCache;
  if (cached && cached.expiresAt > now) return cached.value;

  let parsed: FallbackConfig;
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: AI_FALLBACK_SETTING_KEY } });
    parsed = parseFallbackConfig(row?.value);
  } catch {
    // DB 連不上、或表還沒 push → 回預設（不阻擋系統運作）
    parsed = buildDefaultFallbackConfig();
  }

  globalThis.__aiFallbackConfigCache = { value: parsed, expiresAt: now + CACHE_TTL_MS };
  return parsed;
}

/** 強制重讀（管理員存檔後呼叫，避免 30s 內看到舊值） */
export function invalidateFallbackConfigCache(): void {
  globalThis.__aiFallbackConfigCache = undefined;
}

/** 寫入；只允許 admin 呼叫端 */
export async function saveFallbackConfig(input: FallbackConfig, updatedBy: string | null): Promise<FallbackConfig> {
  // 再做一次清洗，避免 admin UI 帶髒資料進來
  const cleaned = parseFallbackConfig(input);
  await prisma.appSetting.upsert({
    where: { key: AI_FALLBACK_SETTING_KEY },
    create: {
      key: AI_FALLBACK_SETTING_KEY,
      value: cleaned as unknown as object,
      updatedBy,
    },
    update: {
      value: cleaned as unknown as object,
      updatedBy,
    },
  });
  invalidateFallbackConfigCache();
  return cleaned;
}

/**
 * 算出目前「應該嘗試的 provider 順序」：
 *   - chain 中 enabled=true 才納入
 *   - cool down 中的 provider 排到最後（仍嘗試，但優先序降低）
 *   - 沒有任何 provider 可用 → 回空陣列（呼叫端應 fallback 到單一 provider 的舊行為）
 */
export function getOrderedActiveChain(cfg: FallbackConfig, isCool: (p: AiProvider) => boolean): AiProvider[] {
  const enabled = cfg.chain.filter((e) => e.enabled).map((e) => e.provider);
  if (enabled.length === 0) return [];
  const hot = enabled.filter((p) => !isCool(p));
  const cool = enabled.filter((p) => isCool(p));
  return [...hot, ...cool];
}
