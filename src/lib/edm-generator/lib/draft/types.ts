/**
 * v0.7.5.0：Autosave draft payload schema —— 與 EdmSnapshot 解耦的 wire format。
 *
 * # 為什麼不直接存 EdmSnapshot
 *
 *   1) **版本演進**：blocks / tokens / typography 結構改了 → 舊 payload 反序列化會炸 store。
 *      payload 帶 `version` 欄位，不相容時直接整份捨棄、回到乾淨初始狀態（比 partial migrate
 *      風險低很多 —— 培訓師的目標是「不要丟作品」，不是「跨版本完美還原」）。
 *
 *   2) **可觀測性**：`savedAt` / `appVersion` 讓 dev 開 IndexedDB 一眼就知道
 *      payload 從哪個版本、什麼時候寫的。
 *
 *   3) **未來相容**：之後若加入「多份草稿」/「具名草稿」/「雲端同步」等需求，
 *      payload 是天然的 envelope 容器。
 *
 * # version 規則
 *
 *   - 任何 EdmSnapshot 形狀的 breaking change（欄位刪除、語意改變）都要 bump CURRENT_DRAFT_VERSION
 *   - 加新欄位（optional）不需要 bump（讀舊 payload 缺欄位時 store 會用預設值補）
 */

import type { EdmSnapshot } from '@edm/store/edmStore';

/** 目前 payload schema 版本；任何 EdmSnapshot 結構性變更都要 bump 這個 */
export const CURRENT_DRAFT_VERSION = 1 as const;

export interface DraftPayload {
  /** schema 版本；不相容時直接捨棄 payload */
  version: typeof CURRENT_DRAFT_VERSION;
  /** Date.now()；給 footer indicator 顯示「最後儲存：5 秒前」用 */
  savedAt: number;
  /** package.json version；給 dev debug 用，不參與相容判斷 */
  appVersion: string;
  /** EdmStore 的可序列化快照 */
  snapshot: EdmSnapshot;
}

/** 試讀 payload 後的結果型別 */
export type DraftReadResult =
  | { status: 'empty' }                         // 從未寫過 / 已被使用者「捨棄」
  | { status: 'incompatible'; rawVersion: number } // 找到但版本不符
  | { status: 'corrupt'; error: string }        // 找到但解析失敗
  | { status: 'ok'; payload: DraftPayload };
