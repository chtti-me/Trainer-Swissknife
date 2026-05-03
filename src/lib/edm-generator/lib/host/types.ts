/**
 * v0.5.1：HostConfig —— 宿主應用對 EDM Generator 的「整合配置」。
 *
 * 設計原則：
 *   - 所有欄位都選填，不傳就走桌面版 / 純瀏覽器版的預設行為
 *   - 切換為「整合模式」只要傳 `hideSettingsPanel: true` 或注入 NoopSettingsAdapter 即可
 *   - 所有 callback 都是「攔截」性質（caller 可以選擇處理 / 放行給預設邏輯）
 *
 * v0.5.2 會在這個檔加 ExportHook 與 EventHook，保持 v0.5.1 結構先到位。
 */

import type { ClassPlan } from '@edm/types/classPlan';

/**
 * v0.5.1：UI feature flags + 整合層注入點。
 *
 * 從 v0.5.2 起會擴增更多欄位（initialPlan / extraSystemInstructions / onExport*）；
 * 為避免 v0.5.1 完成後又動 type，這裡先把所有計畫中的欄位都列出，
 * 不需要的版本就不要 read。
 */
export interface HostConfig {
  // ─────────────── v0.5.1：UI 隱藏旗標 ───────────────

  /** 整個 SettingsDialog 不掛載 + TopToolbar 齒輪按鈕隱藏（瑞士刀整合用） */
  hideSettingsPanel?: boolean;

  /** 隱藏「請先設定 Gemini API Key」橫幅與警告（有 NoopSettingsAdapter 時自動隱藏） */
  hideApiKeyWarnings?: boolean;

  /** 換掉 toolbar 的「Powered by Gemini · 中華電信學院資訊學系」標題 tooltip */
  poweredByLabel?: string;

  // ─────────────── v0.5.2：整合資料注入 ───────────────

  /** 從外部資料源（例如瑞士刀 DB）帶入的初始 ClassPlan，跳過解析步驟 */
  initialPlan?: ClassPlan;

  /** 初始模板 id；未設則走 EDM Generator 既有預設（'classic'） */
  initialTemplateId?: string;

  /** 初始配色方案 id；未設則走 EDM Generator 既有預設（'cht-brand'） */
  initialPaletteId?: string;

  /**
   * 注入到所有 AI 文案 caller（generateCopy）的 system instructions 末段。
   *
   * 整合場景：瑞士刀的「AI 技能脈絡」appendBuild。
   * 不會覆蓋 caller 自己傳的 extraSystemInstructions（兩者都存在時 host config 為主）。
   */
  extraSystemInstructions?: string;

  /** 同上但對圖片生成 */
  extraImageInstructions?: string;

  // ─────────────── v0.5.2：事件 / 匯出 hook ───────────────

  /**
   * 攔截 PNG 匯出。回傳 true 表示宿主已自行處理（例：上傳 R2 + 寫 DB），
   * EDM Generator 不再走預設下載流程；回傳 false / undefined / 拋錯則走預設下載。
   */
  onExportPng?: (
    blob: Blob,
    filename: string,
  ) => boolean | undefined | Promise<boolean | undefined>;

  /** 攔截 HTML 下載（同上規則） */
  onExportHtml?: (
    html: string,
    filename: string,
  ) => boolean | undefined | Promise<boolean | undefined>;

  /** 攔截 ZIP 下載（同上規則） */
  onExportZip?: (
    blob: Blob,
    filename: string,
  ) => boolean | undefined | Promise<boolean | undefined>;

  /** ClassPlan 任何變更時觸發（用於 sync 回 DB） */
  onPlanChange?: (plan: ClassPlan) => void;

  /** 模板 id 變更時觸發（用於 analytics） */
  onTemplateChange?: (templateId: string) => void;
}
