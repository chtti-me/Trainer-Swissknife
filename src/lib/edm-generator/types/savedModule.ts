/**
 * v0.4.2：SavedModule 型別。
 *
 * 「模組（module）」是一段可以重複使用的 block 序列，例如使用者調好的「我的標準收尾」
 * （instructor + cta + footer）或「客製講師卡片」之類的版型小單元。
 *
 * 跟「模板（template）」的差別：
 *   - 模板（template）：6 個內建版型，定義整份 EDM 的整體敘事結構（hero+headline+...+footer）
 *   - 模組（module）：使用者自訂的「拼塊」，可以是 1 個 block 或 N 個 block
 *
 * 持久化：第一版用 localStorage（Web 與 Electron 共用）。未來 Electron 版可換成 fs adapter。
 */

import type { Block } from './blocks';
import type { ColorTokens, Typography } from './theme';

/** 序列化版本：未來改 SavedModule 結構時 ++，方便 deserialize 做 migration */
export const MODULE_SCHEMA_VERSION = 1;

export interface SavedModule {
  id: string;
  /** 顯示名稱，例如「我的標準收尾」 */
  name: string;
  /** 可選的長描述 */
  description?: string;
  /** 可選的標籤（用來做 tag filter） */
  tags?: string[];

  /** 此模組包含的 block 序列。插入 EDM 時所有 block.id 會被換新（避免衝突） */
  blocks: Block[];

  /**
   * 可選：此模組搭配的全域 token override（套用此模組時可選擇是否一併套用）
   * 第一版 UI 不暴露這個欄位，但型別預留以利未來擴充
   */
  tokens?: Partial<ColorTokens>;
  typography?: Partial<Typography>;

  /** dataUrl 縮圖（v0.4.2 第一版省略，後續版本會加上 html-to-image 預生） */
  thumbnail?: string;
  /** 純文字預覽，沒有縮圖時的 fallback 顯示（取首個 hero/headline/copy 段落的文字） */
  preview?: string;

  createdAt: string; // ISO timestamp
  updatedAt: string;

  /** 此模組由哪一版產生（migration 用） */
  schemaVersion: number;
}

/** JSON 匯出 / 匯入時的 envelope 結構（包一層讓未來能加 metadata） */
export interface ModuleExportEnvelope {
  /** 固定字串，import 時用來檢查 JSON 格式對不對 */
  kind: 'edm-generator-modules-export';
  schemaVersion: number;
  exportedAt: string;
  modules: SavedModule[];
}

export const MODULE_EXPORT_KIND = 'edm-generator-modules-export' as const;
