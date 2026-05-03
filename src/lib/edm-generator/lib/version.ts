/**
 * 版本資訊單一來源（single source of truth）。
 * - 版本字串由 vite.config.ts 從 package.json 注入為 __APP_VERSION__
 * - 階段名稱對應產品路線圖（Phase A/B/C/D），方便 UI 顯示「v0.2 · 階段 A 真模板化」
 *
 * # v0.7.5.x：4 段版本號 vs SemVer 3 段
 *
 * 本專案習慣 4 段命名（v0.7.5.2 = patch 2 of v0.7.5），但 SemVer 標準 + electron-builder
 * 只接受 3 段（MAJOR.MINOR.PATCH）+ 可選 prerelease/build metadata。為了兩邊兼容：
 *
 *   - **package.json `"version"`**：寫 SemVer 合法的 `0.7.5-2`（prerelease 標籤）
 *   - **UI 顯示給使用者**：把 `-` 替換成 `.` 還原為 `0.7.5.2`
 *   - **electron-builder artifactName**：寫死 `EDM-Generator-0.7.5.2-${arch}.${ext}`
 *
 * 結果：使用者看到的所有版本字串都是 `0.7.5.2`，但 npm / electron-builder 內部用合法
 * SemVer。每次 patch bump 要連動修 package.json + electron-builder.yml + 本檔的 PHASE_LABEL key。
 */

/** 完整版本字串，例如 "0.2.0"；4 段版本（"0.7.5-1"）會被還原為「0.7.5.1」對使用者顯示 */
export const APP_VERSION: string = (
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
).replace(/-/g, '.');

/** 簡短版本（去掉 patch），例如 "0.2" */
export const APP_VERSION_SHORT: string = APP_VERSION.split('.').slice(0, 2).join('.');

/**
 * 路線圖階段對應表：
 * - 階段 A：真模板化（每個模板都有獨家 hero/divider/cta/字體）→ v0.2
 * - 階段 B：模板覺察智慧（依模板分流的 AI Copy、智慧 hero 圖、模板專屬 block）→ v0.3
 * - 階段 C：互動精修（拖曳排序、分區編輯、模組庫、AI 文案分版本切換）→ v0.4
 * - 整合準備：AI provider 抽象 / Settings 解耦 / Monorepo 化（為瑞士刀整合鋪路）→ v0.5
 * - 階段 D：內容深化（模板 6 → 12、配色 8 → 10）→ v0.6
 * - 階段 E：使用者體驗深耕（自動 AI enrich、課程表全可編輯、圖片上傳直轉 Base64、Hero 高度修復、tooltip）→ v0.7
 * - 正式版：v1.0 收尾（多語、CI、自動化測試）→ v1.0
 */
export const PHASE_LABEL: Record<string, string> = {
  '0.2': '階段 A · 真模板化',
  '0.3': '階段 B · 模板覺察智慧',
  '0.4': '階段 C · 互動精修',
  '0.5': '整合準備',
  '0.6': '階段 D · 內容深化',
  '0.7': '階段 E · 使用者體驗深耕',
  '1.0': '正式發布版',
};

/** 目前版本所屬的階段標籤；找不到對應就只顯示版本號 */
export function getPhaseLabel(): string {
  return PHASE_LABEL[APP_VERSION_SHORT] ?? '';
}
