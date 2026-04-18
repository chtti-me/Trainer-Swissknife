# 參考素材（Reference materials）

此目錄僅供開發與需求對照，**不是** Next.js 執行時會讀取的靜態資源。線上工具包含：`public/tools/` 的靜態編輯器（簡報、會報），以及 Next.js 路由 **`/tools/teleprompter`**、**`/tools/edm-generator`** 等（見 `src/app/(main)/tools/`）。

## 內容說明

| 項目 | 說明 |
|------|------|
| 根層 `*.html` | TIS／開班計劃表／EDM 等畫面存檔，供解析欄位或 UI 參考 |
| `預約教室需使用的網頁/` | 教室預約相關系統畫面 HTML 存檔 |
| `specs/` | 模組技術規格（Markdown） |
| `legacy-tool-sources/` | 提詞機、簡報製作器、會報工具等**早期獨立專案**備份；正式整合版請以 `public/tools/` 為準。內含巢狀 `.git`（版本庫），若不需歷史可自行刪除子目錄中的 `.git` 以縮小體積 |

## 工具執行路徑（對照）

- 讀稿提詞機：Next **`/tools/teleprompter`**
- EDM／DM 產生器：Next **`/tools/edm-generator`**（API：`POST /api/tools/edm-generator`）
- 互動簡報：Next **`/tools/presentation`**（內嵌 `public/tools/presentation/*.html`）
- 業務會報：Next **`/tools/report-writer`**（內嵌 `public/tools/report-writer/index.html`）
