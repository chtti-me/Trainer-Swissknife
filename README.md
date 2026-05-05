# 培訓師瑞士刀 v4.0（Trainer Swiss Knife）

從中華電信學院「教學資訊系統」爬取資料並儲存至本系統資料庫後，進行後續優化運用的中華電信學院培訓師內部工作平台。

v4.0 **雲端化 + 語意相似度雙引擎**：
- 資料庫從本機 SQLite 升級為 **Supabase PostgreSQL**（台灣／新加坡區域，低延遲）
- 啟用 **pgvector** 擴充，課程向量嵌入直接存 DB，`semantic_search` 改以 `<=>` 索引 + HNSW 取 top K，不再逐筆呼叫 Embedding API
- 相似度檢測改成 **「向量 60% + 文字 40%」內容分數，再與規則欄位按 60/40 加權**，兼顧字面重疊與語意近似
- 部署目標：Next.js 部署到 **Render**，資料庫與 API 由 Supabase 提供（MCP 可全程託管）

v3.0（已內建）**AI Agent 平台**（代號「小瑞」）採 ReAct 架構（推理 + 行動），透過對話介面整合課程規劃、班次查詢、相似度檢測、網路搜尋、檔案操作、腳本執行等工具，並支援 Rules（行為規則）與 Skills（AI 技能脈絡）動態注入。v4.0 進一步新增 `semantic_search`（pgvector 版）、`memory_save/recall`（長期記憶）、`knowledge_query`（RAG）、`workflow_run`、`daily_briefing`、`instructor_search` 等工具。

## 功能模組

### 核心模組

#### 模組 S：AI 助理「小瑞」（Agent 平台）
- 路由：`/agent`；側邊欄第一項
- 類似 ChatGPT 的對話介面，支援 SSE 串流回覆、多對話並行執行
- **ReAct 架構**：推理（Reasoning）→ 呼叫工具（Acting）→ 觀察結果（Observation）→ 回覆使用者
- **內建工具**：
  - `course_plan`：根據培訓需求一次產出開班計劃表欄位
  - `db_query`：查詢系統中的班次資料與培訓師名冊
  - `similarity_check`：比對班次相似度，找出可能重複的課程
  - `semantic_search`（**v4 pgvector 版**）：以向量嵌入 + HNSW 索引在 DB 端直接做語意搜尋
  - `web_search`：透過 Tavily Search API 搜尋即時網路資訊
  - `file_read` / `file_write` / `file_list`：在 `agent-workspace/` 目錄下讀寫檔案（3MB 上限，寫入自動附下載連結）
  - `script_run`：執行系統預定義的安全腳本（白名單機制）
  - `memory_save` / `memory_recall` / `memory_delete`：長期記憶（跨對話保留使用者偏好）
  - `knowledge_query`：對上傳到 `agent-workspace` 的文件做 RAG 問答
  - `workflow_run`：執行預定義多步驟工作流（週報／月度統計／待辦鬧鈴等）
  - `daily_briefing`：產生每日簡報（今日課程 + 即將到期鬧鈴）
  - `instructor_search`：整合「個人師資人脈」「培訓師名冊」「歷史授課紀錄」三大來源推薦講師
- **Rules 規則引擎**：全院規則（admin 設定）+ 個人規則（使用者設定），Agent 推理前自動注入；管理頁面：`/settings/agent-rules`
- **Skills 技能脈絡**：沿用 v2 的 AI 技能脈絡系統，新增 `toolBinding`（工具綁定）與 `triggerCondition`（觸發條件）欄位
- **自定義工具**：使用者可自行新增外部 HTTP 端點作為 Agent 工具（POST JSON → JSON），管理頁面：`/settings/custom-tools`
- **審計日誌**：所有 Agent 工具呼叫自動寫入 AuditLog，可於 `/settings/audit-log` 查看操作歷史
- 對話歷史管理：新增、載入、刪除對話
- 安全性：檔案操作限定工作目錄、腳本白名單、敏感路徑封鎖

#### 模組 A：培訓師儀表板（主模組）
- 我的開班日曆（月曆 / 週曆）
- 我的班次清單（支援多條件篩選）
- 班次詳情頁
- 工作提醒卡片（即將開班、未填授課講師姓名／教室、資料不完整等）
- 匯入與同步狀態顯示

#### 模組 B：課程規劃幫手（v5 全新版 — 11 Skill 多 Agent 架構）
- 路由：`/course-planner`（單頁入口） + `/course-planner/[requestId]`（進度頁 + 開班計畫表編輯）
- **產出聖經**：中華電信學院**開班計畫表**草案（仿圖內版型 + 4 份輔助文件）
- **流程**：貼需求 + 上傳檔（txt/docx/pdf/xlsx/csv）→ 既有班相似度搜尋（前置）→ 11 Skill 依序執行 → 開班計畫表草案 + 輔助文件
- **11 個 Skill（每個都附 reasoning / assumptions / confidence）**：
  - 訓練需求分析（needs）／學員輪廓分析（audience）／學習目標設計（objectives）
  - 課程大綱設計（outline，一個班 = N 堂課）／課程形式選擇（format，含 13 欄開班性質）
  - 講師媒合（instructor，4 來源：個人師資人脈／培訓師名冊／歷史授課／網路）
  - 課程時程規劃（schedule，建議天數 × 每天時數）
  - 課程文案（promo）／課前通知（notification）／教材資源（materials）／課程評量（assessment）
- **既有班沿用機制**：相似度 ≥ 0.85 強烈建議沿用（跳過設計新班）；0.65~0.85 給命名靈感
- **SSE 即時串流**：每 Skill 完成立即推進度與輸出，可點開查看判斷依據
- **草案版本系統**：內聯編輯任一欄位 → 快存 / 儲存新版本 / 切換版本 / 單一 Skill 重跑（自動帶下游）
- **匯出**：markdown / html / json / docx（HTML+msword MIME，Word 可直開）
- **AI 技能脈絡**：呼叫每個 Skill 前自動注入全院共用（`course_planning` + `planning_skill_*`）+ 登入者個人脈絡
- **詳細架構**：見 [`docs/COURSE_PLANNER.md`](docs/COURSE_PLANNER.md)

#### 模組 C：開班相似度檢測（v4 雙引擎）
- 待比較班次輸入
- 多條件篩選（日期區間、院所別、課程類別、開班方式）
- 全院班次資料集比對
- **v4 相似度計算**：`內容分數 × 60% + 規則分數 × 40%`，其中內容分數 = 向量分數（預設 60%）+ 文字分數（預設 40%）
  - 向量引擎：pgvector cosine distance（`1 - embedding <=> query_vec`），HNSW 索引加速
  - 文字引擎：Jaccard + bigram 字詞重疊
  - 規則分數：難度、培訓對象、院所、類別、開班方式欄位相符度
  - 權重可於 `.env` 調整（`SIMILARITY_LEXICAL_WEIGHT`、`SIMILARITY_VECTOR_WEIGHT`）
  - 若班次尚未有向量（例如未 backfill），會自動回退為純文字模式
- 相似原因說明與建議動作（v4 會同時敘述「AI 判定語意…」與「字詞重疊…」兩種依據）

#### 模組 D：教室預約建議
- 支援輸入 TIS session（工作階段）進行即時查詢
- 平台 session（工作階段）有效期 8 小時（TIS 可先行失效）
- 依日期、時段、院所、樓別、教室性質、人數條件產生建議
- 僅提供可借用教室建議，不自動送出最終預約
- 提供前往 TIS 預約頁面連結，最後動作由人員完成
- 支援離線展示模式（`CLASSROOM_OFFLINE_MODE=true`，預設啟用），無法連 TIS 時仍可用模擬資料展示流程

### 工具箱（整合工具）

#### 工具 1：讀稿提詞機
- 講稿文字輸入
- 配色主題切換（深色夜幕、明亮白板、暖色舞台、薄荷霓光）
- 字體大小、捲動速度、行距調整
- 全螢幕提詞模式
- 自動捲動控制
- 剩餘時間預估
- 快捷鍵操作（Space 開始/暫停、Esc 退出）

#### 工具 2：互動教學簡報製作器
- 拖曳式元件編輯（文字、圖片、影片、音訊）
- 互動元件（單選題、複選題、填空題、配對題、拖曳排序）
- 進階元件（程式碼區塊、表格、圖表、時間軸、計時器、可摺疊區塊）
- 連結與內嵌網頁
- 章節與頁面管理
- 屬性面板
- 匯出播放簡報（單一 HTML 檔案）
- 歡迎頁編輯

#### 工具 3：業務會報撰寫器
- 畫布拖曳式編輯（文字方塊、圖片、表格）
- 快速模板（案由、培訓對象、辦理情形、績效與貢獻、後續推廣）
- AI 輔助生成（支援 Google Gemini、OpenAI、OpenRouter）
  - 貼上文字參考資料
  - 上傳截圖
  - 上傳 HTML
  - 提供網址自動抓取內容
- 多人報告合併管理
  - 拖曳調整工作項目順序
  - 匯出 CSV
  - 送入編輯器
- 簡報預覽與播放
  - 全螢幕播放
  - 主題切換
  - 鍵盤導覽
- 匯出功能（PDF、PPTX、可編輯 PPTX）
- 本機儲存（不上傳至伺服器）

#### 工具 4：EDM／DM 產生器（v4.1 整合 EDM-Generator v0.7.5+）
- 路由：`/tools/edm-generator`（Next.js Server Component）+ 後端三支 API：
  - `POST /api/tools/edm-generator/ai/text`：AI 文案（走 OpenAI-compatible，與 AI_PROVIDER 同步）
  - `POST /api/tools/edm-generator/ai/image`：AI Hero 圖（直接走 Gemini 原生 API，因 Imagen / gemini-2.5-flash-image 無 OpenAI 對應）
  - `GET  /api/tools/edm-generator/plan-from-class/[id]`：從 `TrainingClass` 帶入 `ClassPlan`
- **完整視覺化編輯器**：12 模板 / 10 配色 / 區塊拖曳重排 / 行內 RTE（字級、字色、Material Symbols 圖示）/ AI 文案多版本切換 / 模組庫
- **班次直連**：在班次詳情彈窗按「製作 EDM」直接帶入課程資料（跳過貼文字 / OCR / AI 解析三步驟）
- **自動存檔**（IndexedDB）+「重置 EDM」按鈕：重整或當機後可還原作品
- **API Key 不外洩**：客戶端只看 server proxy，OPENAI_API_KEY / GEMINI_API_KEY 永遠不離開 Next.js server
- AI 呼叫自動併入 **AI 技能脈絡**（同 `docs/AI_SKILLS_CONTEXT.md`）+ 中華電信品牌指示
- 程式碼位置：`src/lib/edm-generator/`（內部模組，`@edm/*` 路徑別名）；
  上游專案 `EDM-Generator`（獨立桌面 / Vite repo）的 `src/` 完整搬入此處，
  整合層僅 `src/lib/ai/edm-adapter.ts` + `src/lib/edm/from-db.ts` + `src/app/(main)/tools/edm-generator/{page,edm-client}.tsx` + 三支 API route

#### 系統：AI 技能脈絡（全院 + 個人、多版本）
- 路由：`/settings/ai-skills`；側邊欄 **「AI 技能脈絡」**；系統設定頁可進入
- 全院多筆技能由 **admin** 維護；個人內容每位使用者自行維護；皆支援版本歷史與「複製舊版為新版本」
- **完整說明（給維運與後續開發／AI）**：務必閱讀 **`docs/AI_SKILLS_CONTEXT.md`**

## 技術棧

| 類別 | 技術 |
|------|------|
| 前端 | Next.js 15 + TypeScript + Tailwind CSS |
| UI 元件 | shadcn/ui (Radix UI) |
| 日曆 | FullCalendar |
| 後端 | Next.js API Routes（Node runtime）|
| **資料庫** | **Supabase PostgreSQL 17 + pgvector + Prisma ORM**（v4 升級） |
| AI | 多供應商（OpenAI / Gemini）OpenAI-compatible API；Embedding 用 `text-embedding-3-small`（1536d）或 `gemini-embedding-001`（預設 3072d，本系統透過 `dimensions` 參數截斷至 768d 以符合 pgvector HNSW 上限） |
| 搜尋 | `web_search` 走 Tavily Search API；`semantic_search` / 相似度檢測走 pgvector |
| 相似度（v4 雙引擎）| 向量分數（pgvector cosine）+ 文字分數（Jaccard + bigram）+ 規則分數（條件欄位加權） |
| 部署 | Next.js → Render；資料庫 → Supabase Cloud |

## 快速開始

### 前置需求

- Node.js 18+
- Supabase 專案（免費方案即可，含 pgvector 擴充）
- （選配）OpenAI 或 Gemini API Key

### 1. 安裝依賴

```bash
npm install
```

### 2. 設定環境變數

編輯 `.env`，至少設定以下項目（v4 必填）：

```bash
# Supabase PostgreSQL
# ⚠ pooler 主機名（aws-0 / aws-1 / aws-2 ...）依專案而異，
#   請從 Supabase Dashboard → Settings → Database → Connection string 複製，
#   填錯會出現「FATAL: Tenant or user not found」。
# ⚠ 密碼若含 @ # ! / : 等字元，必須 URL encode（@→%40 …）。
DATABASE_URL="postgresql://postgres.<ref>:<url_encoded_密碼>@aws-1-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.<ref>:<url_encoded_密碼>@aws-1-<region>.pooler.supabase.com:5432/postgres"

# Embedding（必須與 prisma/schema.prisma 的 vector(N) 對齊）
# 預設搭配 Gemini ➜ 768；改用 OpenAI ➜ 1536（並改 schema 重 db push）。
AI_PROVIDER="gemini"
GEMINI_API_KEY="..."
GEMINI_EMBEDDING_MODEL="gemini-embedding-001"
EMBEDDING_DIMENSION=768

# 相似度雙引擎權重（預設值）
SIMILARITY_LEXICAL_WEIGHT=0.4
SIMILARITY_VECTOR_WEIGHT=0.6
```

### 3. 初始化資料庫（Supabase）

> v4 資料庫為 PostgreSQL，必須先啟用 pgvector。若是透過本專案 MCP 建立的 Supabase 專案，`CREATE EXTENSION vector` 已自動執行。

```bash
npx prisma generate
npx prisma db push
```

**從 v3（SQLite）升級**：參考 `docs/V4_UPGRADE_GUIDE.md`，核心步驟：
```bash
# 1) 備份舊 SQLite 檔（v3 dev.db），設定 LEGACY_SQLITE_URL
# 2) 把資料搬到新 Postgres
npm run migrate:sqlite-to-pg
# 3) 為所有班次產生向量嵌入（需 API Key）
npm run embed:backfill
# 4) 建 HNSW 索引，加速語意搜尋
npm run embed:create-index
```

### 4. 建立種子資料

```bash
npm run db:seed
```

此指令會建立：
- **測試使用者**：多名培訓師帳號 + 1 名系統管理員（詳見下方測試帳號表，與 `prisma/seed.ts` 一致）
- **班次**：自 `prisma/data/y115-open-classes.json` 匯入（內容來自 `docs/reference-materials/…/115年開班計畫表` 內 TIS 另存 **HTML** 經解析後之 **115 年開班計畫**；筆數隨 JSON 而變）
- **培訓師名冊（Trainer）**：由 TIS「導師」欄位去重建立（**導師＝開班導師／培訓師**，為本系統主要使用者族群之一）
- **授課講師姓名**：無獨立資料表；僅班次上的 `instructor_names`（課程附屬文字）。開班計畫表 HTML 通常無此欄，種子班次該欄為空；TIS 導師姓名寫入 `mentor_name` 快照並可綁定 `trainer_user_id`
- 1 筆同步紀錄
- **全院 AI 技能**預設 5 筆 slug（占位內容，管理員可於 UI 改寫）；資料定義見 `prisma/default-global-ai-skills-data.ts`

若資料庫已存在但尚未有任何全院 AI 技能列，可單獨補齊（不刪其他資料）：`npm run db:seed:ai-global`。

若您更新參考 HTML 後要重產 JSON，請執行：

```bash
npm run db:seed:y115-json
```

再執行 `npm run db:seed` 寫入資料庫。

### 5. 啟動開發伺服器

```bash
npm run dev
```

`npm run dev` 會先嘗試釋放 **埠 3000（port 3000）**（結束佔用該埠的舊 Node／Next 行程），再以 **固定埠 3000** 啟動，避免常被改到 3001。若要改埠：`DEV_PORT=3005 npm run dev`（Windows PowerShell 可用 `$env:DEV_PORT=3005; npm run dev`）。若不想自動清埠，可用 `npm run dev:raw`。

開啟 http://localhost:3000

### 6. 登入系統

測試帳號：

| 姓名 | Email | 密碼 | 角色 |
|------|-------|------|------|
| 黃建豪 | trainer1@cht-academy.tw | password123 | 培訓師（資訊學系，院本部） |
| 林怡萱 | trainer2@cht-academy.tw | password123 | 培訓師（台中所） |
| 陳志豪 | trainer3@cht-academy.tw | password123 | 培訓師（高雄所） |
| 系統管理員 | admin@cht-academy.tw | admin123 | 系統管理員（企管學系，院本部） |

### 管理員建帳路徑（Administrator account provisioning）

本系統**沒有公開註冊頁**（no public sign-up）；正式帳號由具 **admin（系統管理員）** 權限者於後台建立與維護。

1. 使用管理員帳號登入後，可從 **側邊欄（sidebar）** 點選 **「使用者管理」**，或直接開啟路徑 **`/settings/users`**。
2. 亦可先到 **「系統設定」**（`/settings`），在頂部 **「使用者管理」** 卡片按 **「前往使用者管理」**，進入同一畫面。
3. 在該頁可 **新增、編輯、刪除** 使用者；可維護 **電子郵件（email，兼作登入帳號）**、**姓名**、**單位（培訓師限定）**、**密碼（password）**、**角色（role：僅 `trainer` 培訓師 或 `admin` 系統管理員）** 等欄位。**院所別（campus）** 會依培訓師單位自動帶入（三個學系對應院本部；台中所、高雄所對應各自院所）。
4. 培訓師可選單位僅限：**資訊學系、企管學系、網路學系**（皆屬院本部）、**台中所**、**高雄所**。
5. 開發環境若僅需測試帳號，仍可使用 **`npm run db:seed`** 寫入種子資料；進階維護亦可使用 **Prisma Studio**（`npx prisma studio`）檢視或編輯資料庫。

## 匯入測試資料

系統支援 CSV 格式的班次資料匯入，範例檔案位於 `sample-data/classes.csv`。

**班代號**：若為 TIS 慣用之九碼（五碼 + `P`|`T`|`K`|`E` + 三位期別），匯入時會自動寫入 `tisClassId5`、`tisVenueCode`、`tisSessionCode`；第三碼數字代表難易度（1：基礎、2：進階、3：高級、4：專精），另寫入 `tisDifficultyDigit`。詳見 `docs/TIS_TRAINING_CLASS_ALIGNMENT.md`。

CSV 欄位對應：

| CSV 欄位 | 說明 |
|----------|------|
| 班代號 | 班次代號 |
| 班名 | 班次名稱 |
| 院所別 | 院本部 / 台中所 / 高雄所 |
| 課程類別 | 資訊安全 / 數位轉型 / 網路技術 / 管理技能 |
| 班次類型 | 年度計畫班 / 臨時需求專案班 / 學程班 |
| 難度 | 基礎 / 進階 / 高級 / 專精 |
| 開班方式 | 課堂 / 直播 / 遠距 / 混成 |
| 開班日期 | YYYY-MM-DD 格式 |
| 結束日期 | YYYY-MM-DD 格式 |
| 講師 | 授課講師姓名（寫入班次 `instructor_names`，非獨立主檔） |
| 地點 | 開班地點 |
| 教室 | 教室名稱 |
| 摘要 | 課程內容摘要 |
| 培訓對象 | 受訓對象描述 |
| 狀態 | 規劃中 / 已排定 / 即將開班 / 已結訓 |

## AI 功能說明

若未設定目前供應商對應的 API Key（`AI_PROVIDER=openai` 時看 `OPENAI_API_KEY`；`AI_PROVIDER=gemini` 時看 `GEMINI_API_KEY`），系統會自動使用 Mock 回應，所有功能仍可正常運作（但 AI 生成的內容為預設範本）。

設定 API Key 後，系統會使用所選供應商模型進行：
- 課程規劃一次產出（建議班名、目標、對象、預備知識、課程模組、建議講師）
- 建議講師搜尋（OpenAI 模式支援網路搜尋；Gemini 模式由 AI 推薦）
- EDM 宣傳文案（`POST /api/tools/edm-generator/ai/text`，自動依 `AI_PROVIDER` 切換 OpenAI / Gemini）
- EDM Hero 圖片生成（`POST /api/tools/edm-generator/ai/image`，固定走 Gemini `imagen-4.0-generate-001` / `gemini-2.5-flash-image`，故需設定 `GEMINI_API_KEY`）

上述會呼叫 LLM 的 API，會依登入使用者 **動態附加「AI 技能脈絡」**（資料庫中的全院共用 + 個人最新版文字）。**擴充新 AI 功能時**，請在後端呼叫 `buildAiSkillPromptAppend(userId)`（`src/lib/ai-skills.ts`）並併入 prompt；**完整架構、資料表、路由清單與維護注意**見專案文件：

→ **`docs/AI_SKILLS_CONTEXT.md`**

支援 OpenAI-compatible API 三家，並可透過 `AI_PROVIDER` 切換：
- `AI_PROVIDER=openai`：使用 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`
- `AI_PROVIDER=gemini`：使用 `GEMINI_API_KEY`、`GEMINI_BASE_URL`、`GEMINI_MODEL`
- `AI_PROVIDER=groq`：使用 `GROQ_API_KEY`、`GROQ_BASE_URL`（預設 `https://api.groq.com/openai/v1`）、`GROQ_MODEL`（預設 `llama-3.3-70b-versatile`）

### 各功能可獨立指定供應商（per-feature override）

支援「課程規劃幫手用 Groq、其他功能用 Gemini」這種混搭。解析優先序：

```
{COURSE_PLANNER|EDM|AGENT}_AI_PROVIDER  (功能專屬 env)
        ↓ 沒設
AI_PROVIDER  (全站預設 env)
```

對課程規劃幫手而言，還可以再被 `CoursePlanRequest.aiProvider` 欄位覆蓋（培訓師在 UI 上選的）。建議用法：

```bash
AI_PROVIDER="gemini"                       # 全站預設用 Gemini
COURSE_PLANNER_AI_PROVIDER="groq"          # 課程規劃幫手特別用 Groq（額度大）
GROQ_API_KEY="gsk_..."
```

或：所有功能都用 Gemini，但**個別培訓師**在課程規劃幫手頁面的「執行引擎」下拉手動切到 Groq（每個 request 獨立記）。

## 範例需求文字

`sample-data/sample-requirement.txt` 包含一段範例需求 Email，可直接貼入「課程規劃幫手」進行測試。

## 專案結構

（以程式目錄為準；`public/tools/` 為簡報／會報等 **iframe（內嵌框架）** 靜態編輯器，`src/app/(main)/tools/*` 為對應之 **Next.js** 包裝頁與 **EDM** 等動態頁。）

```
trainer-swissknife/
├── docs/
│   ├── AI_SKILLS_CONTEXT.md     # AI 技能脈絡（全院／個人／版本／API／擴充方式）
│   ├── TIS_TRAINING_CLASS_ALIGNMENT.md
│   └── reference-materials/   # TIS／教室預約等參考 HTML、規格（不影響建置）
│       ├── specs/               # 技術規格 Markdown
│       └── legacy-tool-sources/ # 舊版獨立工具備份
├── prisma/
│   ├── schema.prisma          # 資料庫 Schema
│   ├── seed.ts                # 種子資料
│   ├── seed-ai-global-defaults.ts  # 僅補全院 AI 技能預設（無則寫入）
│   ├── default-global-ai-skills-data.ts  # 預設 slug 與占位內文
│   ├── data/                  # y115-open-classes.json 等
│   └── lib/                   # HTML 解析（開班計畫表）
├── public/
│   └── tools/                 # 靜態工具（簡報 editor/player、會報 index 等）
├── sample-data/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── login/
│   │   ├── (main)/
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/           # 培訓師儀表板
│   │   │   ├── course-planner/      # 課程規劃幫手 v5（11 Skill 多 Agent）
│   │   │   ├── similarity/          # 開班相似度檢測
│   │   │   ├── classroom-suggestions/  # 教室預約建議
│   │   │   ├── sync/                # 資料同步紀錄
│   │   │   ├── trainers/            # 培訓師名冊（TIS 導師／開班導師）
│   │   │   ├── settings/            # 系統設定
│   │   │   ├── settings/ai-skills/  # AI 技能脈絡（全院 admin + 個人）
│   │   │   ├── settings/agent-rules/# v3 Agent 規則管理
│   │   │   ├── settings/audit-log/  # v3 審計日誌
│   │   │   ├── settings/custom-tools/ # v3 自定義工具管理
│   │   │   ├── settings/users/      # 使用者管理（admin）
│   │   │   ├── agent/              # v3 AI 助理對話介面
│   │   │   └── tools/
│   │   │       ├── teleprompter/    # 讀稿提詞機
│   │   │       ├── presentation/    # 互動簡報（內嵌 public/tools/presentation）
│   │   │       ├── report-writer/   # 業務會報（內嵌 public/tools/report-writer）
│   │   │       └── edm-generator/   # v4.1 EDM 產生器（page.tsx server + edm-client.tsx 包 <EdmGenerator />）
│   │   └── api/                     # REST API（含 admin、agent、course-planner、similarity、edm-generator/ai/{text,image} 等）
│   ├── components/
│   └── lib/
│       ├── agent/                   # v3 Agent 核心引擎
│       │   ├── core.ts              # ReAct 主迴圈 + SSE 串流
│       │   ├── types.ts             # Agent 型別定義
│       │   ├── context.ts           # Rules + Skills 脈絡組裝
│       │   ├── history.ts           # 對話歷史管理
│       │   ├── tool-registry.ts     # 工具註冊表
│       │   └── tools/               # 內建工具 + custom-tool-runner（course_plan、db_query、similarity_check、web_search、file_ops、script_run、自定義工具引擎）
│       ├── course-planner/          # 課程規劃幫手 v5（11 Skill schemas + skills + orchestrator + form-mapper + exporters + lookups）
│       ├── edm/                     # EDM 整合層：from-db.ts（TrainingClass → ClassPlan 對映）
│       ├── edm-generator/           # ⭐ v4.1：EDM-Generator v0.7.5+ 完整移植（@edm/* 路徑別名）
│       │   ├── EdmGenerator.tsx    # 主元件（hostConfig / aiAdapter / settingsAdapter / initialPlan props）
│       │   ├── components/          # 完整視覺化編輯器 UI（AppShell / Canvas / panels / RTE / dnd）
│       │   ├── core/、react/、electron-integration/  # v0.5.3 4 個 entry barrels
│       │   ├── lib/ai/、lib/draft/、lib/email/、lib/templates/ 等  # 純函式核心
│       │   ├── store/               # zustand stores（edm / settings / ui / hostConfig / modules / draftStatus）
│       │   └── styles/globals.css   # ⚠ 不直接 import；其 base styles 與瑞士刀的衝突
│       └── ...                      # prisma、auth、ai-provider、ai-skills、similarity、ai/edm-adapter（client→server proxy）、utils…
├── .env.example
├── docker-compose.yml
├── package.json
└── README.md
```

## 不做的事

- 不寫回 TIS
- 不做正式簽核流程
- 不做薪資、稅務、個資敏感欄位處理

## v3 新增 API

| 端點 | 方法 | 說明 |
|------|------|------|
| `/api/agent/chat` | POST | Agent 對話（SSE 串流回覆） |
| `/api/agent/conversations` | GET | 列出使用者對話 |
| `/api/agent/conversations` | POST | 建立新對話 |
| `/api/agent/conversations/[id]` | GET | 取得對話詳情（含訊息） |
| `/api/agent/conversations/[id]` | DELETE | 刪除對話 |
| `/api/agent/rules` | GET | 列出 Agent 規則 |
| `/api/agent/rules` | POST | 新增規則 |
| `/api/agent/rules/[id]` | PUT | 更新規則 |
| `/api/agent/rules/[id]` | DELETE | 刪除規則 |
| `/api/agent/audit-log` | GET | 查詢審計日誌（分頁、篩選） |
| `/api/agent/custom-tools` | GET | 列出使用者自定義工具 |
| `/api/agent/custom-tools` | POST | 新增自定義工具 |
| `/api/agent/custom-tools/[id]` | PUT | 更新自定義工具 |
| `/api/agent/custom-tools/[id]` | DELETE | 刪除自定義工具 |

## v3 新增 Prisma 模型

| 模型 | 說明 |
|------|------|
| `AgentConversation` | Agent 對話 session（工作階段） |
| `AgentMessage` | 對話訊息（含工具呼叫紀錄 JSON） |
| `AgentRule` | Agent 行為規則（全院 / 個人） |
| `CustomTool` | 使用者自定義 Agent 工具（HTTP 端點） |
| `AiGlobalSkillDefinition` | 新增 `toolBinding`、`triggerCondition` 欄位 |

## v4 新增 / 變更

| 項目 | 變更 |
|------|------|
| 資料庫 | SQLite → Supabase PostgreSQL 17 |
| 向量欄位 | `TrainingClass.embedding vector(768)`（搭配 Gemini gemini-embedding-001 截斷；改 OpenAI 路徑時調為 vector(1536)）+ HNSW 索引 |
| 相似度 | 純文字 → 向量 + 文字 + 規則 三引擎融合 |
| `semantic_search` | 逐筆呼叫 API → pgvector `<=>` 一次取 top K |
| 新增腳本 | `migrate-sqlite-to-postgres.ts` / `backfill-embeddings.ts` / `create-vector-index.ts` |
| 部署 | 新增 `render.yaml`（Next.js 單服務部署到 Render）|
| 環境變數 | 新增 `DATABASE_URL`/`DIRECT_URL`（Pooler）、`SUPABASE_URL`、`SUPABASE_ANON_KEY`、`EMBEDDING_DIMENSION`、`SIMILARITY_*_WEIGHT` |

## 後續版本方向（v5+）

- Agent 多 Agent 協作（規劃 Agent + 執行 Agent + 驗證 Agent）
- 串接正式 TIS 只讀同步器（排程）
- Outlook / Google Calendar 整合
- 自定義工具模板市集
- Edge runtime 下的向量搜尋（Supabase Edge Functions）
