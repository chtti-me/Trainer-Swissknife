# 培訓師瑞士刀 v4.0 升級指南

> 從 v3.0（SQLite + 純文字相似度）升級到 v4.0（Supabase PostgreSQL + pgvector 雙引擎相似度）。

## 🎯 升級重點

| 面向 | v3.0 | v4.0 |
|------|------|------|
| 資料庫 | 本機 SQLite (`prisma/dev.db`) | Supabase PostgreSQL 17（雲端） |
| 向量搜尋 | 每次呼叫都跑 N 次 Embedding API | pgvector 預先建立，HNSW 索引一次取 top K |
| 相似度引擎 | 文字（Jaccard + bigram）+ 規則 | 向量 + 文字 + 規則（雙引擎融合） |
| 部署目標 | 本機 dev / 自架 | 本機 dev / Render（Next.js）+ Supabase（DB） |

## 📋 升級前準備

1. **備份 v3 資料**
   ```bash
   cp prisma/dev.db prisma/dev.db.v3-backup-$(date +%Y%m%d).db
   ```

2. **準備 Supabase 專案**
   - 建立專案：<https://supabase.com/dashboard>
   - 區域選擇靠近台灣的 `ap-southeast-1`（新加坡）或 `ap-northeast-1`（東京）
   - 啟用 pgvector：
     ```sql
     CREATE EXTENSION IF NOT EXISTS vector;
     ```
   - **取得連線字串：Settings → Database → Connection string**
     - 切到 **Connection pooling** 頁籤，複製 **Transaction（6543）** 與 **Session（5432）** 兩條 URI
     - 主機名長相是 `aws-<N>-<region>.pooler.supabase.com`，**`<N>` 不一定是 0**（可能是 1、2 …），務必照 Dashboard 抄
     - 帳號是 `postgres.<project_ref>`（不是純 `postgres`）

3. **準備 Embedding API Key**（任選其一）
   - **Gemini（免費起跳，本專案預設）**：到 <https://aistudio.google.com/app/apikey> 取得
   - **OpenAI**：到 <https://platform.openai.com/api-keys> 取得

## 🚀 升級步驟

### Step 1：更新環境變數

```bash
# 編輯 .env

# ⚠ 主機名與 <region> 請從 Dashboard 複製；密碼若含 @ # ! 等特殊字元要先 URL encode（@ → %40）。
DATABASE_URL="postgresql://postgres.<ref>:<url_encoded_密碼>@aws-1-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.<ref>:<url_encoded_密碼>@aws-1-<region>.pooler.supabase.com:5432/postgres"

# 從 v3 SQLite 匯入時用
LEGACY_SQLITE_URL="file:./prisma/dev.db.v3-backup-YYYYMMDD.db"

# === Embedding 維度設定（重要！）===
# 預設走 Gemini 路徑，與 schema 內 vector(768) 對齊：
AI_PROVIDER="gemini"
GEMINI_API_KEY="..."
GEMINI_EMBEDDING_MODEL="gemini-embedding-001"
EMBEDDING_DIMENSION=768

# 若改走 OpenAI 路徑，需同時：
#   1) AI_PROVIDER=openai 並填 OPENAI_API_KEY
#   2) OPENAI_EMBEDDING_MODEL=text-embedding-3-small
#   3) EMBEDDING_DIMENSION=1536
#   4) prisma/schema.prisma 把 vector(768) 改 vector(1536)
#   5) 重新 npx prisma db push（會更新欄位型別，現有 embedding 會被清空，需重 backfill）

# 相似度雙引擎權重
SIMILARITY_LEXICAL_WEIGHT=0.4
SIMILARITY_VECTOR_WEIGHT=0.6
```

### Step 2：套用新版 Prisma schema

```bash
npm install                    # 安裝 better-sqlite3 等新依賴
npx prisma generate            # 產生 Prisma Client（PostgreSQL 版）
npx prisma db push             # 推送 schema 到 Supabase（自動建立所有表 + pgvector 欄位）
```

> 想先確認連線是否通？可以執行：
> ```bash
> npx prisma db execute --stdin --url "$DATABASE_URL" <<< "SELECT 1"
> ```

### Step 3：遷移舊資料（SQLite → PostgreSQL）

```bash
npm run migrate:sqlite-to-pg
```

腳本會：
- 讀取 `LEGACY_SQLITE_URL` 指向的 SQLite 檔
- 依 FK 順序逐筆 upsert 到 Supabase
- 全程冪等，可重複執行

### Step 4：批次產生向量嵌入

```bash
# 只處理沒有嵌入的（增量）
npm run embed:backfill

# 或全部重建（更換模型時）
npm run embed:backfill -- --rebuild
```

> ⚠ Gemini 免費方案有 **每分鐘 100 RPM** 上限，量大時前幾百筆會中斷在 429（quota exceeded）。
> 腳本本身為增量式，停下來等 1 分鐘再跑一次 `npm run embed:backfill` 就會自動補齊剩下的。

### Step 5：建立 HNSW 向量索引

```bash
npm run embed:create-index
```

> 資料量小（< 1 萬筆）時，索引未建好也能用，只是查詢稍慢。
> 資料量大時，索引可把 top-K 查詢從 O(N) 降到 O(log N)。

### Step 6：啟動並驗證

```bash
npm run dev
```

開啟以下頁面驗證：
- `GET /api/health` → 應回 `{"ok":true,"checks":{"db":true,"pgvector":true}}`
- `/dashboard` → 班次資料是否完整
- `/similarity` → 跑一次相似度檢測，回應 JSON 應包含 `engine: "vector+lexical+rule"`、`vectorMatched > 0`
- `/agent` → 問小瑞「請用語意搜尋找雲端相關課程」，回應應出現工具呼叫 `semantic_search`，內含 `engine: "pgvector-hnsw"`

### 一行驗證腳本（cURL）

> 把 `<COOKIE_JAR>` 換成 mktemp 路徑，PORT 可改 3001：

```bash
JAR=$(mktemp)
CSRF=$(curl -s -c $JAR http://localhost:3000/api/auth/csrf | jq -r .csrfToken)
curl -s -b $JAR -c $JAR -X POST http://localhost:3000/api/auth/callback/credentials \
  -d "csrfToken=$CSRF&email=admin@cht.com.tw&password=admin123&json=true" >/dev/null
curl -s -b $JAR -X POST http://localhost:3000/api/similarity/check \
  -H "Content-Type: application/json" \
  -d '{"query":{"className":"AWS 雲端架構","summary":"雲端基礎"},"filters":{"startDate":"2024-01-01","endDate":"2026-12-31","threshold":0.5}}' \
| jq '{engine, totalCompared, vectorMatched, matchCount}'
```

預期輸出：
```json
{ "engine": "vector+lexical+rule", "totalCompared": 205, "vectorMatched": 205, "matchCount": 0 }
```

## 🌐 雲端部署（Render）

```bash
# 1) 推送 render.yaml 到 git
git add render.yaml
git commit -m "v4.0: add Render Blueprint"
git push

# 2) 到 Render Dashboard → New → Blueprint → 連 GitHub repo
# 3) 設定 sync: false 的環境變數（DATABASE_URL、DIRECT_URL、API Keys 等）
# 4) Deploy
```

詳見 `render.yaml` 註解。

## 🔧 疑難排解

### ❶ `prisma db push` 報錯 `extension "vector" is not available`
- 解法：到 Supabase Dashboard → Database → Extensions → 啟用 `vector`，或執行：
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ```

### ❷ Prisma 連線報 `FATAL: Tenant or user not found`
這是最常見的坑，幾乎都是 pooler URL 抄錯，按以下順序檢查：

1. **主機名不一定是 `aws-0`**：你的專案可能落在 `aws-1-ap-southeast-1.pooler.supabase.com`
   或 `aws-2-…`。請到 **Supabase Dashboard → Settings → Database → Connection string → Connection pooling** 直接複製。
2. **帳號必須是 `postgres.<project_ref>`**（一個小數點），不是純 `postgres`。
3. **密碼要 URL encode**：`@ → %40`，`# → %23`，`! → %21`，`/ → %2F`，`: → %3A`，空白 → `%20`。
4. 一條檢驗用的 cURL：
   ```bash
   PGPASSWORD='your_raw_password' psql \
     "postgres://postgres.<ref>@aws-1-<region>.pooler.supabase.com:6543/postgres" -c "select 1"
   ```

### ❸ 直連 `db.<ref>.supabase.co` 在 WSL／某些雲環境連不到
- 原因：Supabase 直連端點為 **IPv6 only**，WSL2 預設沒有 IPv6 出網。
- 解法：**全部改走 pooler**（兩條 URI 都用同一個 `aws-N-<region>.pooler.supabase.com` 主機，
  `DATABASE_URL` 用 6543（transaction mode），`DIRECT_URL` 用 5432（session mode），
  prisma migrate / db push 走 5432 完全沒問題。

### ❹ `embed:backfill` 報 `404 models/text-embedding-004 is not found for API version v1main`
- 原因：Gemini 的 OpenAI-compatible 端點目前**不接受** `text-embedding-004` 這個名字。
- 解法：`.env` 改 `GEMINI_EMBEDDING_MODEL="gemini-embedding-001"`。

### ❺ pgvector 報 `expected 768 dimensions, not 3072`（或反之）
- 原因：`gemini-embedding-001` 預設輸出 **3072 維**，超過 pgvector HNSW 索引上限（2000 維），
  且與 schema `vector(768)` 不符。
- 解法：本專案已在 `src/lib/embedding.ts` 與 `scripts/backfill-embeddings.ts` 統一傳 `dimensions: 768`
  讓 Gemini 用 Matryoshka 截斷，自動對齊。請確保 `.env` 的 `EMBEDDING_DIMENSION=768`。

### ❻ `embed:backfill` 中途出現 `429 You exceeded your current quota`
- 原因：Gemini 免費方案 embedding 限制每分鐘 100 RPM。
- 解法：等 60 秒後再執行 `npm run embed:backfill`（增量模式自動只補沒做完的那幾筆）。

### ❼ `npm run dev` 在 WSL 報 `EADDRINUSE :::3000`
- 原因：可能有別的服務（例如 ttyd、code-server）長期佔用 3000，且 `dev.mjs` 不會誤殺非 Next.js 程式。
- 解法：用其他埠啟動：
  ```bash
  DEV_PORT=3001 NEXTAUTH_URL=http://localhost:3001 npm run dev
  ```
  記得讓 `NEXTAUTH_URL` 與實際 port 一致，不然 Credentials 登入會失敗（這就是 `.env` 中 `AUTH_TRUST_HOST=true` 的用意之一）。

### ❽ `/api/health` 回 `{"error":"未授權"}`
- 原因：早期版本 `src/middleware.ts` 把所有 `/api/*` 都納入認證攔截，連健康檢查也會被擋。
- 解法：v4 已把 `/api/health` 加進 `PUBLIC_PATHS` 白名單。如果你 fork 自更舊版本，請手動加上。

### ❾ `embed:backfill` 報 `This module cannot be imported from a Client Component`
- 原因：`src/lib/embedding.ts` 內 `import "server-only"`，無法被 tsx 腳本載入。
- 解法：v4 的 `scripts/backfill-embeddings.ts` 已不依賴 `src/lib/embedding`，內嵌一份 lite 版邏輯。
  如果你 fork 自更舊版本，請更新該腳本。

### ❿ 相似度檢測仍只回傳文字分數（`engine: "lexical+rule"`）
- 原因：`embedding` 欄位尚未填充，或 `EMBEDDING_DIMENSION` 與 schema 維度對不上導致 backfill 全失敗。
- 解法：`npm run embed:backfill` 並檢查最後輸出的「成功 N 筆」是否大於 0；之後再呼叫 `/api/similarity/check`。

### ⓫ Render 部署成功但 agent 上傳的檔案隔天不見了
- 原因：Render 檔案系統是臨時的（ephemeral）。
- 解法：v5 規劃改用 Supabase Storage；或改部署到自架 VM。
