# 培訓師瑞士刀 — 部署指南

本文件說明**日常開發完成後如何讓新版程式上線到 Render**，以及各種情境下需要額外處理的步驟。

> **前提**：你已經完成初次部署（`render.yaml` 已 push、Render 服務已建立、環境變數已設定）。  
> 初次部署請參考 `docs/V4_UPGRADE_GUIDE.md` 的「🌐 雲端部署（Render）」章節。

---

## 📍 線上服務資訊

| 項目 | 值 |
|------|-----|
| **正式網址** | https://trainer-swissknife.onrender.com |
| **Render Dashboard** | https://dashboard.render.com/web/srv-d7hjsst7vvec739dkgi0 |
| **GitHub Repo** | https://github.com/chtti-me/Trainer-Swissknife |
| **健康檢查端點** | https://trainer-swissknife.onrender.com/api/health |
| **節點** | Singapore |
| **方案** | Free（閒置 15 分鐘休眠、冷啟動 ~30 秒）|

---

## 🚀 日常部署流程（最短路徑）

**適用情境**：只改程式碼，沒有動到環境變數或資料庫 schema。

### Step 1：確保本機能 build

```bash
npm run build
```

若出現錯誤，先修好再繼續。這一步可以提前發現 TypeScript / ESLint 錯誤，避免浪費 Render 的 build 時間。

### Step 2：提交並推送到 GitHub

```bash
git add -A
git commit -m "說明這次改了什麼"
git push origin main
```

### Step 3：等待 Render 自動部署

- Render 已設定 **auto deploy**，只要 `main` 分支有新 commit 就會自動觸發
- 通常 **2-5 分鐘**完成（npm ci + prisma generate + next build + 啟動）
- 可以到 [Render Dashboard](https://dashboard.render.com/web/srv-d7hjsst7vvec739dkgi0) → **Deploys** 頁籤看進度

### Step 4：驗證上線成功

```bash
curl https://trainer-swissknife.onrender.com/api/health
```

預期回應：
```json
{"ok":true,"version":"v4.0","checks":{"db":true,"pgvector":true},"latencyMs":...}
```

也可以直接用瀏覽器打開登入頁：https://trainer-swissknife.onrender.com/login

---

## 🔧 情境一：新增或修改環境變數

**適用情境**：`.env` 裡新增了變數、改了變數值、或刪除了變數。

### 重要觀念

- 本機 `.env` **不會**自動同步到 Render
- `.env` 檔案有 `.gitignore` 保護，**不會**被 commit
- 你必須手動到 Render Dashboard 設定對應的環境變數

### 步驟

1. **在本機 `.env` 改好**，確認本機 `npm run dev` 或 `npm run build` 正常

2. **到 Render Dashboard 設定**：
   - 開啟 https://dashboard.render.com/web/srv-d7hjsst7vvec739dkgi0
   - 點左側選單 **Environment**
   - 新增、修改、或刪除對應的變數
   - 點 **Save Changes**

3. **Render 會自動觸發 redeploy**（存檔後幾秒內）

4. **如果程式碼也有改**，照常 `git push origin main`（兩邊會合併成同一次部署）

5. **驗證**

### 常見環境變數分類

| 類別 | 變數名稱 | 說明 |
|------|----------|------|
| **資料庫** | `DATABASE_URL` | Supabase pooler 連線字串（6543 port）|
| | `DIRECT_URL` | Supabase direct 連線字串（5432 port，Prisma migrate 用）|
| **Supabase** | `SUPABASE_URL` | 專案 API URL |
| | `SUPABASE_ANON_KEY` | 公開 API Key |
| **AI** | `AI_PROVIDER` | `gemini` 或 `openai` |
| | `GEMINI_API_KEY` | Gemini API Key |
| | `OPENAI_API_KEY` | OpenAI API Key（若用 OpenAI）|
| | `GEMINI_EMBEDDING_MODEL` | 嵌入模型名稱（目前 `gemini-embedding-001`）|
| | `EMBEDDING_DIMENSION` | 向量維度（目前 `768`）|
| **工具** | `TAVILY_API_KEY` | Tavily Search API Key |
| **認證** | `NEXTAUTH_SECRET` | Session 加密密鑰（Render 自動產生）|
| | `NEXTAUTH_URL` | 正式網址（`https://trainer-swissknife.onrender.com`）|
| **相似度** | `SIMILARITY_THRESHOLD` | 相似度閾值（預設 `0.75`）|
| | `SIMILARITY_LEXICAL_WEIGHT` | 文字引擎權重（預設 `0.4`）|
| | `SIMILARITY_VECTOR_WEIGHT` | 向量引擎權重（預設 `0.6`）|

### 特別注意

- **密碼中有特殊字元**（如 `@`、`#`、`!`、`/`）：在 `DATABASE_URL` / `DIRECT_URL` 裡必須 URL encode（例如 `@` → `%40`）
- **NEXTAUTH_URL 換網域**：如果將來綁自訂網域，記得同步更新這個變數，否則登入會失敗
- **API Key 外洩**：如果發現 Key 外洩，立刻到 Gemini / OpenAI / Supabase / Tavily 後台撤銷並重新產生，然後更新 Render 環境變數

---

## 🗄️ 情境二：修改資料庫 Schema

**適用情境**：改了 `prisma/schema.prisma`（新增欄位、改型別、新增 model 等）。

### 重要觀念

- Render 的 build 只會執行 `prisma generate`（產生 Prisma Client）
- Render **不會**幫你執行 `prisma db push` 或 `prisma migrate`
- 你必須**先**把 schema 同步到 Supabase，**再** push 程式碼

### 步驟

1. **本機修改 `prisma/schema.prisma`**

2. **同步到 Supabase**（二選一）：

   **方法 A：db push（開發階段推薦）**
   ```bash
   npx prisma db push
   ```
   - 直接把 schema 推到 DB，不產生 migration 檔
   - 適合開發階段快速迭代

   **方法 B：migrate（正式環境推薦）**
   ```bash
   npx prisma migrate dev --name 描述這次改了什麼
   ```
   - 產生 migration 檔並執行
   - 適合需要版本控制的正式環境

3. **產生新的 Prisma Client**
   ```bash
   npx prisma generate
   ```

4. **本機測試**
   ```bash
   npm run dev
   # 確認功能正常
   ```

5. **提交並推送**
   ```bash
   git add -A
   git commit -m "feat(db): 說明 schema 改了什麼"
   git push origin main
   ```

6. **Render 自動部署**（build 時會 `prisma generate`，讀到已同步的 schema）

### 特別注意：向量維度變更

如果你改了 embedding 維度（例如從 768 改成 1536），需要額外步驟：

1. 改 `prisma/schema.prisma` 裡的 `vector(768)` → `vector(1536)`
2. 改 `.env` 的 `EMBEDDING_DIMENSION=1536`
3. 改 Render 環境變數 `EMBEDDING_DIMENSION=1536`
4. 執行 `npx prisma db push`
5. **重跑 embedding backfill**（因為維度不同，舊的 embedding 不能用）：
   ```bash
   npm run embed:backfill
   npm run embed:create-index
   ```
6. 然後 `git push origin main`

---

## 📦 情境三：新增 npm 套件

**適用情境**：安裝了新的 npm package。

### 步驟

1. **安裝套件**
   ```bash
   npm install 套件名稱
   # 或
   npm install -D 套件名稱  # devDependency
   ```

2. **確認 `package.json` 和 `package-lock.json` 都有更新**
   ```bash
   git status
   # 應該看到這兩個檔案被修改
   ```

3. **本機測試**
   ```bash
   npm run build
   ```

4. **提交並推送**
   ```bash
   git add package.json package-lock.json
   git commit -m "deps: add 套件名稱"
   git push origin main
   ```

5. **Render 會在 build 時 `npm ci` 安裝新套件**

---

## 🤖 情境四：讓 AI 協助部署

如果你在 Cursor 裡跟 AI 助理（我）一起開發，可以直接說：

> 「幫我部署到 Render」

我會自動做這些事：

1. 檢查有沒有未 commit 的改動
2. 跑 `npm run build` 確認能過
3. 幫你 `git add` + `git commit`（會問你 commit message 或自己判斷）
4. `git push origin main`
5. 用 Render MCP 監控部署狀態
6. 部署完成後驗證 `/api/health`
7. 回報結果（成功或失敗原因）

**如果部署失敗**，我會自動讀 Render build log 找出錯誤原因，並嘗試修復。

---

## ⏪ 情境五：回退到舊版本

如果新版上線後發現重大問題，需要緊急回退：

### 方法 A：從 Render Dashboard 回退（最快）

1. 開啟 https://dashboard.render.com/web/srv-d7hjsst7vvec739dkgi0
2. 點 **Deploys** 頁籤
3. 找到上一個成功的 deploy（狀態是 `Live` 之前的那個）
4. 點該 deploy → **Rollback to this deploy**
5. 確認後 Render 會立即切換到舊版本

### 方法 B：用 Git revert（有紀錄）

```bash
# 查看最近的 commit
git log --oneline -10

# revert 最新的 commit
git revert HEAD

# 推送
git push origin main
```

這會產生一個新的 commit 來「撤銷」上一個 commit 的改動，Render 會自動部署。

### 方法 C：用 Git reset（強制覆蓋，慎用）

```bash
# 回到指定 commit
git reset --hard <commit-hash>

# 強制推送（會覆蓋遠端歷史）
git push --force-with-lease origin main
```

⚠️ 這會**永久刪除**之後的 commit 歷史，除非你確定沒有其他人在用這個 repo，否則不建議。

---

## 🐛 常見問題與解法

### ❶ Build 失敗：Cannot find module 'autoprefixer'

**原因**：Render 在 `NODE_ENV=production` 下會讓 `npm ci` 自動跳過 devDependencies。

**解法**：已在 `render.yaml` 設定 `NPM_CONFIG_PRODUCTION=false`，正常不會再遇到。如果還是遇到，檢查 Render 環境變數是否有這個設定。

### ❷ Build 失敗：TypeScript type error

**原因**：本機可能用了較寬鬆的 TS 設定，但 Render 跑的是 `next build` 的嚴格模式。

**解法**：
1. 本機先跑 `npm run build` 確認能過
2. 如果是型別斷言問題，使用 `as unknown as TargetType` 雙重斷言

### ❸ 部署成功但網站顯示 502 Bad Gateway

**原因**：服務還在啟動中，或啟動失敗。

**解法**：
1. 等 30 秒再試
2. 到 Render Dashboard → Logs 看 runtime log
3. 常見原因：環境變數沒設、資料庫連不上、port binding 錯誤

### ❹ 部署成功但登入失敗（CSRF / callback error）

**原因**：`NEXTAUTH_URL` 設定錯誤。

**解法**：確認 Render 環境變數 `NEXTAUTH_URL` 是 `https://trainer-swissknife.onrender.com`（注意是 https，不是 http）。

### ❺ Agent 上傳的檔案隔天不見了

**原因**：Render 檔案系統是 ephemeral（臨時的），每次部署或重啟都會清空。

**解法**：這是已知限制，目前 `agent-workspace/` 只能當暫存區用。v5 規劃改用 Supabase Storage。

### ❻ 服務閒置後第一次訪問很慢（30 秒）

**原因**：Free 方案閒置 15 分鐘會休眠，下次訪問需要冷啟動。

**解法**：
- 接受這個行為（50 人內部使用，上班時段通常不會閒置太久）
- 或升級到 Starter 方案（$7/月），就不會休眠

### ❼ 想強制重新部署（不改程式）

**方法 A**：到 Render Dashboard → Manual Deploy → Deploy latest commit

**方法 B**：到 Render Dashboard → Environment → 隨便加一個 dummy 變數（如 `DEPLOY_NONCE=1`）然後存檔

**方法 C**：請 AI 用 MCP 觸發部署

### ❽ 想清除 build cache

Render 會快取 `node_modules`，有時候快取壞掉會導致奇怪的錯誤。

**解法**：到 Render Dashboard → Settings → Build & Deploy → **Clear build cache & deploy**

---

## 📋 部署前檢查清單

在 push 之前，建議跑過這張清單：

- [ ] `npm run build` 本機能過
- [ ] 如果改了 `.env`，Render 環境變數也要同步
- [ ] 如果改了 `prisma/schema.prisma`，已執行 `npx prisma db push`
- [ ] 如果改了向量維度，已重跑 `embed:backfill`
- [ ] commit message 有意義（方便日後回溯）

---

## 🔗 相關資源

- [Render 官方文件](https://render.com/docs)
- [Render 部署疑難排解](https://render.com/docs/troubleshooting-deploys)
- [Next.js 部署文件](https://nextjs.org/docs/deployment)
- [Prisma 部署指南](https://www.prisma.io/docs/guides/deployment)
- [Supabase Dashboard](https://supabase.com/dashboard)

---

## 📝 更新紀錄

| 日期 | 版本 | 說明 |
|------|------|------|
| 2026-04-18 | v1.0 | 初版，涵蓋日常部署、環境變數、schema 變更、回退、常見問題 |
