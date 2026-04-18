# AI 技能脈絡（Skills Context）

> **給維運者與後續 AI 助手**：本文件說明「全院共用 + 個人」技能文字如何存入資料庫、如何編輯、以及如何注入到全系統的生成式 AI（LLM）Prompt。實作以程式碼為準；若與 UI 用語略有出入，以 `src/lib/ai-skills.ts` 與 `prisma/schema.prisma` 為準。

## 目的

- **全院共用**：多筆技能（依 `slug` 區分，例如 `course_planning`、`edm`），由 **系統管理員（admin）** 維護；一般培訓師 **只能被動使用**（內容會進入 AI Prompt），無法改寫。
- **個人脈絡**：每位登入使用者一組個人文字（同樣支援 **多版本**），讓 AI 對齊該培訓師的偏好與敘事習慣（**不含個資**為原則；可能含內部組織／系統描述，由單位自行控管）。
- **版本**：每次儲存會 **新增一筆版本**（不覆寫舊版）。可從 UI 下拉選歷史版本，編輯後再存成新版本，或使用「將所選版本複製成新版本」保留時間軸。
- **全系統**：不限於課程規劃或 EDM；**任何新的 API 若會呼叫 LLM，應呼叫** `buildAiSkillPromptAppend(userId)` 並併入該次請求（見下方「擴充方式」）。

## 資料表（Prisma）

| 模型 | 說明 |
|------|------|
| `AiGlobalSkillDefinition` | 全院一種技能一筆，`slug` 唯一，`title`、`sortOrder` |
| `AiGlobalSkillVersion` | 內容版本，`definitionId` + `versionNo` 唯一，`content`、`createdAt` |
| `AiTrainerSkillDefinition` | 每位使用者一筆，`userId` 唯一，關聯 `User` |
| `AiTrainerSkillVersion` | 個人內容版本，欄位邏輯同上 |

## 預設資料與種子

- 預設 slug 與占位內文定義於 **`prisma/default-global-ai-skills-data.ts`**。
- 完整重種：`npm run db:seed` 會清空並重建 DB，並寫入上述預設全院技能（見 `prisma/seed.ts`）。
- **僅補全院預設**（不刪其他資料）：若尚無任何 `AiGlobalSkillDefinition`，可執行 **`npm run db:seed:ai-global`**（`prisma/seed-ai-global-defaults.ts`）。

## API 路由

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| GET | `/api/admin/ai-skills/global` | admin | 全院技能列表（含最新版摘要） |
| POST | `/api/admin/ai-skills/global` | admin | 新增 `slug` + `title`（建立第 1 版） |
| GET | `/api/admin/ai-skills/global/[slug]` | admin | 單一技能 + 全部版本 |
| PATCH | `/api/admin/ai-skills/global/[slug]` | admin | 更新標題、排序 |
| POST | `/api/admin/ai-skills/global/[slug]/versions` | admin | `{"content":"..."}` 新版本；或 `{"restoreFromVersionNo":n}` 複製舊版為新版本 |
| GET | `/api/ai-skills/personal` | 已登入 | 個人定義 + 版本列 |
| POST | `/api/ai-skills/personal/versions` | 已登入 | 同上，`content` 或 `restoreFromVersionNo` |

## Prompt 組裝

- **核心函式**：`src/lib/ai-skills.ts` 的 **`buildAiSkillPromptAppend(forUserId: string, options?)`**。
- 行為摘要：依 `sortOrder`、`slug` 排序讀取全院各技能 **最新一版**（僅輸出 `content` 非空的項目）；再讀取該使用者個人 **最新一版**；組成一段繁中說明文字（含簡短合規提示）。若全院與個人皆無有效內容，回傳空字串。
- **可選篩選**：`includeSlugs`／`includeSlugPrefixes` 可只注入特定全院技能（例如課程規劃 API 只帶 `course_planning`、`instructor_search`、`classroom`、`schedule` 及 slug 以 `planning_` 開頭者，避免 EDM 等無關內容佔滿 token）。

## 目前已注入的呼叫點（請同步維護本清單）

以下路由已於伺服端取得 `session.user.id` 並傳入技能區塊：

- `POST /api/planning/generate` → `runCoursePlanAgent(input, { skillContextAppend })`（`src/lib/planning/agent.ts`）；帶入 `includeSlugs` + `includeSlugPrefixes: ['planning_']` 篩選全院技能，一次產出開班計劃表所需核心欄位
- `POST /api/tools/edm-generator` → 文案 prompt 尾端附加（`src/app/api/tools/edm-generator/route.ts`）

## 擴充方式（新 AI 功能必讀）

1. 在對應 **Route Handler** 取得登入使用者 `id`（與現有 API 相同）。
2. `const skillAppend = await buildAiSkillPromptAppend(userId);`
3. 將 `skillAppend` 併入送給模型的 **user 訊息**（或與現有程式一致：接在既有 prompt 字串後）。若為空字串可略過以節省 token。

## UI

- 頁面路徑：**`/settings/ai-skills`**（側欄「AI 技能脈絡」、系統設定頁入口）。
- 管理員在全院區可新增 slug、編輯標題／排序、多版本儲存與還原；所有使用者可編輯個人區。

## slug 命名規則（API 驗證）

- 小寫英文字母開頭，僅允許 `a-z`、`0-9`、底線 `_`，長度 1～64（實作見 `assertValidSkillSlug`）。

---

**文件維護**：新增或變更 AI 注入點時，請更新本文「目前已注入的呼叫點」小節，並在 `README.md` 的 AI 相關段落保持與本文件連結一致。
