import "server-only";
import type { AiProvider } from "../ai-provider-types";

/**
 * 【AI 供應商即時用量統計】
 *
 * 記憶體層的「今日請求數 / 錯誤數 / cool down 截止時間」。
 *   - 重啟會清空（Render free 容易休眠 → 自然重置；可接受）
 *   - 一台 Node.js 程序內共享（同一台 server 多 worker 各自獨立；Render 預設 1 worker，沒問題）
 *
 * 為什麼不存 DB：
 *   - 每一次 LLM 呼叫都要 +1，DB write 太頻繁會拖慢主流程
 *   - 真正要持久的是「設定」（chain、threshold），不是「即時統計」
 */

export interface ProviderUsage {
  /** 今日（UTC）成功請求次數 */
  successCount: number;
  /** 今日（UTC）錯誤次數 */
  errorCount: number;
  /** 今日（UTC）切換出此 provider 的次數 */
  switchOutCount: number;
  /** 上次成功時間 epoch ms（沒有則 0） */
  lastSuccessAt: number;
  /** 上次錯誤時間 epoch ms */
  lastErrorAt: number;
  /** 上次錯誤訊息（簡短） */
  lastErrorMessage: string | null;
  /** cool down 截止 epoch ms（0 表示沒有 cool down） */
  cooldownUntil: number;
}

/** UTC 日期字串 (YYYY-MM-DD)，用來判斷「跨日」要不要重置 */
function utcDateKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

interface UsageRegistry {
  /** 上次重置的 UTC 日期 key */
  dateKey: string;
  /** provider → usage 統計 */
  byProvider: Map<AiProvider, ProviderUsage>;
}

function emptyUsage(): ProviderUsage {
  return {
    successCount: 0,
    errorCount: 0,
    switchOutCount: 0,
    lastSuccessAt: 0,
    lastErrorAt: 0,
    lastErrorMessage: null,
    cooldownUntil: 0,
  };
}

/**
 * 用 globalThis 跨 hot reload 保留統計（dev mode 改 code 不會丟失；prod 不影響）。
 * 同時這也讓「同一個 Node.js 程序」內所有 import 的人共享同一份狀態。
 */
declare global {
  // eslint-disable-next-line no-var
  var __aiProviderUsageRegistry: UsageRegistry | undefined;
}

function getRegistry(): UsageRegistry {
  if (!globalThis.__aiProviderUsageRegistry) {
    globalThis.__aiProviderUsageRegistry = {
      dateKey: utcDateKey(),
      byProvider: new Map(),
    };
  }
  // 跨日重置（保留 cool down，因為 cool down 是「秒數」短期效果）
  const today = utcDateKey();
  if (globalThis.__aiProviderUsageRegistry.dateKey !== today) {
    const carry = globalThis.__aiProviderUsageRegistry.byProvider;
    const next = new Map<AiProvider, ProviderUsage>();
    for (const [k, v] of carry.entries()) {
      next.set(k, {
        ...emptyUsage(),
        cooldownUntil: v.cooldownUntil,
      });
    }
    globalThis.__aiProviderUsageRegistry = { dateKey: today, byProvider: next };
  }
  return globalThis.__aiProviderUsageRegistry;
}

function readUsage(provider: AiProvider): ProviderUsage {
  const reg = getRegistry();
  let u = reg.byProvider.get(provider);
  if (!u) {
    u = emptyUsage();
    reg.byProvider.set(provider, u);
  }
  return u;
}

export function recordSuccess(provider: AiProvider): void {
  const u = readUsage(provider);
  u.successCount += 1;
  u.lastSuccessAt = Date.now();
}

export function recordError(provider: AiProvider, message: string): void {
  const u = readUsage(provider);
  u.errorCount += 1;
  u.lastErrorAt = Date.now();
  u.lastErrorMessage = (message || "").slice(0, 280);
}

export function recordSwitchOut(provider: AiProvider): void {
  const u = readUsage(provider);
  u.switchOutCount += 1;
}

/** 標記某 provider 進入 cool down（暫時跳過不用）；secs 為冷卻秒數 */
export function setCooldown(provider: AiProvider, secs: number): void {
  if (!Number.isFinite(secs) || secs <= 0) return;
  const u = readUsage(provider);
  u.cooldownUntil = Date.now() + Math.floor(secs * 1000);
}

/** 是否在 cool down 中？ */
export function isInCooldown(provider: AiProvider): boolean {
  return readUsage(provider).cooldownUntil > Date.now();
}

/** 立即解除 cool down（管理員 UI「重置」按鈕用） */
export function clearCooldown(provider: AiProvider): void {
  readUsage(provider).cooldownUntil = 0;
}

/** 列出所有 provider 的目前統計（給 runtime-stats API 用） */
export function snapshotAllUsage(): Array<{ provider: AiProvider; usage: ProviderUsage; inCooldown: boolean }> {
  const reg = getRegistry();
  const out: Array<{ provider: AiProvider; usage: ProviderUsage; inCooldown: boolean }> = [];
  for (const [k, v] of reg.byProvider.entries()) {
    out.push({ provider: k, usage: { ...v }, inCooldown: v.cooldownUntil > Date.now() });
  }
  return out;
}

/** 給單一 provider 快照 */
export function getUsage(provider: AiProvider): ProviderUsage {
  return { ...readUsage(provider) };
}

/** 給管理員「全部重置」用 */
export function resetAllUsage(): void {
  globalThis.__aiProviderUsageRegistry = {
    dateKey: utcDateKey(),
    byProvider: new Map(),
  };
}
