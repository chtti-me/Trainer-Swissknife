/**
 * v0.5.0：AI Adapter Registry —— 全域注入點。
 *
 * 預設行為：第一次被使用時 lazy-create `GeminiBrowserAdapter`（保留 v0.4.x 行為）。
 *
 * 整合行為：宿主應用（例如「培訓師瑞士刀」Next.js 主站）可在啟動時呼叫
 *   `setAiAdapter(myServerProxyAdapter)` 換成走 server proxy 的實作。
 *   之後所有 `generateCopy` / `generateImage` / `parseClassPlan` / `autoLayout`
 *   都會走那個 adapter。
 *
 * 為什麼用全域 singleton 而不是 React context？
 *   - 大量 caller 是純 async 函式（非 React component），用 context 要每個都 hook 化
 *   - Zustand store 已經是同樣的 singleton 模式，新模組沒理由變花
 *   - 整合時只要在 Next.js root 層注入一次即可（client component 或 server action 都能用）
 */

import type { AiAdapter } from './adapter';
import { GeminiBrowserAdapter } from './adapters/geminiBrowser';

let injected: AiAdapter | null = null;
let lazyDefault: AiAdapter | null = null;

/** 取得目前全域 AiAdapter；沒注入過就回傳預設的 GeminiBrowserAdapter */
export function getAiAdapter(): AiAdapter {
  if (injected) return injected;
  if (!lazyDefault) {
    lazyDefault = new GeminiBrowserAdapter();
  }
  return lazyDefault;
}

/**
 * 注入自訂 AiAdapter（例如瑞士刀整合時走 server proxy）。
 * 傳 `null` 可以還原為預設的 GeminiBrowserAdapter。
 */
export function setAiAdapter(adapter: AiAdapter | null): void {
  injected = adapter;
}

/** 測試專用：清掉 lazy default，下次取會重新建構 */
export function _resetAiAdapter(): void {
  injected = null;
  lazyDefault = null;
}
