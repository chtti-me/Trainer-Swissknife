/**
 * Headline 文字效果 CSS（v0.7.3 新增）。
 *
 * 統一 source of truth —— 同一份 keyframes + class 定義給兩個地方用：
 *   1. **EmailTemplate.tsx**：嵌入 `RESPONSIVE_STYLE`，匯出 EDM HTML 時帶在 <style> 裡
 *   2. **EditableCanvas.tsx**：注入到 `<style>` 標籤，讓使用者編輯時即時看到效果
 *
 * 設計原則 —— 漸進增強（progressive enhancement）：
 *
 * | 客戶端                  | animation | background-clip:text | 結果                                      |
 * |------------------------|-----------|----------------------|------------------------------------------|
 * | Apple Mail / iOS       | ✅        | ✅                   | 完整動畫 + 漸層文字                       |
 * | Gmail web / mobile     | ⚠️ 部分   | ⚠️ 部分              | 多數效果可看，少數降級                    |
 * | Outlook web            | ⚠️ 部分   | ❌                   | 動畫多半 OK，gradient-text 退化為純色文字  |
 * | Outlook desktop (Win)  | ❌ 完全   | ❌                   | 看到「靜態最終樣式」（典型 graceful fail） |
 *
 * 所以每個 effect 必須確保「靜態最終狀態」本身可讀：
 *   - typewriter：終點 width=100% + animation-fill-mode:forwards → 不支援 animation 也看到完整文字
 *   - blink：keyframes 50% 才到 0.4，0%/100% 都是 1 → 不支援也看到 opacity:1
 *   - fade-in：終點 opacity:1 + fill-mode:forwards → 不支援也看到 opacity:1（inline 不要寫 opacity:0）
 *   - gradient-text：用 !important 確保 background-clip 生效時 color 變透明；不支援時 fallback 到 inline color
 *
 * 這個檔案只 export 純 string，不依賴 React / DOM，可被 SSR / Node 工具直接讀取。
 */

export const HEADLINE_EFFECT_CSS = `
@keyframes edmTypewriter {
  from { width: 0; }
  to { width: 100%; }
}
@keyframes edmBlinkText {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
@keyframes edmFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* typewriter：邊框右側模擬游標，搭配 typewriter + blink 兩段動畫疊加 */
.edm-effect-typewriter {
  display: inline-block;
  overflow: hidden;
  white-space: nowrap;
  border-right: 2px solid currentColor;
  animation: edmTypewriter 2.5s steps(40, end) 0.2s forwards, edmBlinkText 0.7s step-end infinite alternate;
}

/* blink：純 opacity 循環，不支援 animation 的客戶端會看到 opacity:1 完整文字 */
.edm-effect-blink {
  animation: edmBlinkText 1.4s ease-in-out infinite;
}

/* fade-in：一次性淡入並上浮，fill-mode:forwards 鎖定最終 opacity:1 */
.edm-effect-fade-in {
  animation: edmFadeIn 0.8s ease-out 0.1s forwards;
}

/* gradient-text：background-clip:text 把漸層套到字上；
   !important 確保 color:transparent 不被 inline color 覆蓋（讓漸層能透過字形顯示） */
.edm-effect-gradient-text {
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent !important;
  -webkit-text-fill-color: transparent;
}
`;
