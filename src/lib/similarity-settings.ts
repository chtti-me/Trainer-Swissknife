import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * 【相似度檢測設定 — DB 持久化層】
 *
 * 把原本散落在 .env / hard-coded 的 5 個相似度參數集中由管理員 UI 動態調整。
 * 完全套用 src/lib/ai-providers/settings.ts 那套已驗證 pattern（DB key + 30s cache + 向前相容 merge）。
 *
 * 解析優先序：
 *   1. DB（app_settings.key="similarity.config"）
 *   2. .env（SIMILARITY_THRESHOLD / SIMILARITY_LEXICAL_WEIGHT / SIMILARITY_VECTOR_WEIGHT）
 *   3. hard-coded fallback（與舊版同）
 *
 * 為什麼不用環境變數：
 *   - .env 改完 server 必須重啟，無法線上調整
 *   - hard-coded 修改要工程師發版
 *   - 改用 DB 後，admin UI 拉一拉 slider 即時生效，方便 demo 與微調
 */

export const SIMILARITY_SETTING_KEY = "similarity.config";

export interface SimilarityConfig {
  /** 相似度檢測 API 的預設過濾分數（0.5–0.95；request body 傳的會覆蓋） */
  defaultThreshold: number;
  /** 文字引擎權重（0–1；與 vectorWeight 加總自動正規化為 1） */
  lexicalWeight: number;
  /** 向量引擎權重（0–1；與 lexicalWeight 加總自動正規化為 1） */
  vectorWeight: number;
  /** 課程規劃幫手「強烈建議沿用既有班」的門檻（0.7–0.95） */
  reuseThreshold: number;
  /** 課程規劃幫手「中度相似可參考」的門檻（0.4–0.85；必須 < reuseThreshold） */
  referenceThreshold: number;
}

/**
 * 從 .env 取數值（若未設或非數字回 fallback）。
 * 用於建立預設值與 DB 缺欄位 fallback。
 */
function envNum(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** 正規化 lexical/vector 兩權重為加總 1.0；若兩個都 ≤ 0 則回預設 0.4/0.6。 */
function normalizeWeights(lex: number, vec: number): { lexicalWeight: number; vectorWeight: number } {
  const a = Number.isFinite(lex) && lex >= 0 ? lex : 0.4;
  const b = Number.isFinite(vec) && vec >= 0 ? vec : 0.6;
  const sum = a + b;
  if (sum <= 0) return { lexicalWeight: 0.4, vectorWeight: 0.6 };
  return {
    lexicalWeight: Math.round((a / sum) * 1000) / 1000,
    vectorWeight: Math.round((b / sum) * 1000) / 1000,
  };
}

/** clamp 數值到 [min, max] 區間，並 round 到指定小數位（避免 0.79999 之類雜訊）。 */
function clampNum(v: number, min: number, max: number, decimals = 2): number {
  if (!Number.isFinite(v)) return min;
  const clamped = Math.min(max, Math.max(min, v));
  const factor = Math.pow(10, decimals);
  return Math.round(clamped * factor) / factor;
}

/**
 * 預設設定：先讀 .env，否則 hard-coded（與既有行為一致以利平滑遷移）。
 *   - defaultThreshold 預設 0.75（與舊 settings 頁顯示一致）
 *   - lexicalWeight / vectorWeight 預設 0.4 / 0.6
 *   - reuse / reference 預設 0.85 / 0.65（與 existing-class-lookup.ts 原 hard-coded 一致）
 */
export function buildDefaultSimilarityConfig(): SimilarityConfig {
  const w = normalizeWeights(
    envNum("SIMILARITY_LEXICAL_WEIGHT", 0.4),
    envNum("SIMILARITY_VECTOR_WEIGHT", 0.6)
  );
  return {
    defaultThreshold: clampNum(envNum("SIMILARITY_THRESHOLD", 0.75), 0.3, 0.99),
    lexicalWeight: w.lexicalWeight,
    vectorWeight: w.vectorWeight,
    reuseThreshold: 0.85,
    referenceThreshold: 0.65,
  };
}

/**
 * 解析 DB 內 raw JSON；任何欄位缺失或型別錯都套預設值，永不拋例外。
 * 同時 enforce「reference < reuse」邏輯約束。
 */
function parseSimilarityConfig(raw: unknown): SimilarityConfig {
  const def = buildDefaultSimilarityConfig();
  if (!raw || typeof raw !== "object") return def;
  const o = raw as Record<string, unknown>;

  const defaultThreshold = clampNum(
    typeof o.defaultThreshold === "number" ? o.defaultThreshold : def.defaultThreshold,
    0.3,
    0.99
  );
  const w = normalizeWeights(
    typeof o.lexicalWeight === "number" ? o.lexicalWeight : def.lexicalWeight,
    typeof o.vectorWeight === "number" ? o.vectorWeight : def.vectorWeight
  );
  let reuseThreshold = clampNum(
    typeof o.reuseThreshold === "number" ? o.reuseThreshold : def.reuseThreshold,
    0.6,
    0.99
  );
  let referenceThreshold = clampNum(
    typeof o.referenceThreshold === "number" ? o.referenceThreshold : def.referenceThreshold,
    0.3,
    0.95
  );
  // 邏輯：reference 必須 < reuse；若反了就把 reference 拉回 reuse - 0.05
  if (referenceThreshold >= reuseThreshold) {
    referenceThreshold = clampNum(reuseThreshold - 0.05, 0.3, 0.95);
  }
  // 二次保險：reuse 不能小於 reference + 0.05
  if (reuseThreshold <= referenceThreshold) {
    reuseThreshold = clampNum(referenceThreshold + 0.1, 0.6, 0.99);
  }

  return {
    defaultThreshold,
    lexicalWeight: w.lexicalWeight,
    vectorWeight: w.vectorWeight,
    reuseThreshold,
    referenceThreshold,
  };
}

interface CacheCell {
  value: SimilarityConfig;
  expiresAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __similarityConfigCache: CacheCell | undefined;
}

const CACHE_TTL_MS = 30_000;

/**
 * 讀取目前相似度設定（30s in-memory cache）。
 * 找不到 / DB 連不上 → 回 buildDefaultSimilarityConfig()，永不拋例外。
 *
 * 設計意圖：相似度檢測是高頻操作（agent / planner / 手動檢測），
 * 每次都打 DB 不划算；一旦 admin 透過 saveSimilarityConfig 寫入會立刻 invalidate cache，
 * 所以 30s 過期窗對使用者體感無差別。
 */
export async function loadSimilarityConfig(): Promise<SimilarityConfig> {
  const now = Date.now();
  const cached = globalThis.__similarityConfigCache;
  if (cached && cached.expiresAt > now) return cached.value;

  let parsed: SimilarityConfig;
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SIMILARITY_SETTING_KEY } });
    parsed = parseSimilarityConfig(row?.value);
  } catch {
    parsed = buildDefaultSimilarityConfig();
  }

  globalThis.__similarityConfigCache = { value: parsed, expiresAt: now + CACHE_TTL_MS };
  return parsed;
}

/** 強制重讀（管理員存檔後呼叫，避免 30s 內看到舊值） */
export function invalidateSimilarityConfigCache(): void {
  globalThis.__similarityConfigCache = undefined;
}

/** 寫入；只允許 admin 呼叫端 */
export async function saveSimilarityConfig(
  input: SimilarityConfig,
  updatedBy: string | null
): Promise<SimilarityConfig> {
  const cleaned = parseSimilarityConfig(input);
  await prisma.appSetting.upsert({
    where: { key: SIMILARITY_SETTING_KEY },
    create: {
      key: SIMILARITY_SETTING_KEY,
      value: cleaned as unknown as object,
      updatedBy,
    },
    update: {
      value: cleaned as unknown as object,
      updatedBy,
    },
  });
  invalidateSimilarityConfigCache();
  return cleaned;
}

/** 重置為「程式內預設值」(不刪 DB row，直接 upsert 預設值)；給 admin UI「恢復預設」按鈕用 */
export async function resetSimilarityConfig(updatedBy: string | null): Promise<SimilarityConfig> {
  return saveSimilarityConfig(buildDefaultSimilarityConfig(), updatedBy);
}
