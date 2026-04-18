# TIS 開班計畫表 與本專案 `TrainingClass` 資料對照

> 對應產品版本：**v2.0**（備份里程碑）；後續欄位調整請同步更新本文。

參考存檔：`docs/reference-materials/「培訓師儀表板」模組/115年開班計畫表/*.html` 與 `開班計畫表-列表、查詢網址.txt`。

## 班代號（class code）結構

依學院文件與畫面實例（如 `CR24CE014`、`CB41EE015`）：

| 片段 | 長度 | 說明 |
|------|------|------|
| **classid** | 5 | 班別代號前五碼；對應 DB `tisClassId5` |
| **場域碼** | 1 | 第六碼：`P` 板橋院本部、`T` 台中所、`K` 高雄所、`E` 全 e 課程；對應 `tisVenueCode` |
| **期別** | 3 | 三位數期別（sessions）；對應 `tisSessionCode` |

**完整班代號**（九碼）存在 `classCode`，並可由 `src/lib/tis-class-code.ts` 的 `parseTisClassCode` 解析。

其中，班別代號（classid）之第3碼具備特殊含義，以1碼表示難易度數字 1–4，程式亦會解析，並將數字寫入 `tisDifficultyDigit`，同時將中文難度寫入既有欄位 `difficultyLevel`（基礎／進階／高級／專精）。



## TIS 列表畫面有、本專案目前沒有（或僅部分對應）的欄位

| TIS／HTML 概念 | 說明 |
|----------------|------|
| **狀態(導師)** 細節 | 如「已核定」、導師姓名、報名狀態「已報名(n)」等；本專案有 `status`、`mentorName`（TIS 導師快照）、`instructorNames`（**授課講師**文字，無獨立主檔），但**未**拆報名人數、核定細節 |
| **處理** 連結 | 查詢列印、簽核、課表列印、資安檢查表等 URL；本專案未存連結，僅有通用 `materialLink` 等可日後擴充 |
| **seq／classid／department／sdate** | 查詢網址參數；本專案以 `sourceSystemId` 保留擴充，種子未強制填入 |
| **(計畫)、(純直播課程)** 等註記 | HTML 內嵌說明；本專案無對應欄位，可考慮 `notes` 或 `rawPayload` |
| **體系別 (C)** | 班名後括號；未單獨欄位，可併入 `className` 或日後 `academyStream` |

## 本專案有、TIS 列表未直接呈現的欄位

| 欄位 | 用途 |
|------|------|
| `trainerUserId` | 與本系統使用者（培訓師）綁定，儀表板「我的班次」 |
| `embeddingText` | 相似度／語意比對用合併文字 |
| `requestSource`、`classType` | 規劃／專案班流程 |
| `maxStudents`、`summary`、`audience` | 教學設計與 CSV 慣例 |

## `category`（課程類別）

- 匯入時：若 CSV 有「課程類別」則**優先**採用；否則依 **班名** 關鍵字啟發式推論（`inferCategoryFromClassName`）。
- 無法判斷時為 `null`（空白）。

## 後續可討論的擴充方向（不影響現有功能）

1. 新增 `enrollmentCount`、`tisStatus`（已核定／…）對應報名區塊文字  
2. 新增 `planQueryUrl` 或 JSON 存 TIS 處理連結  
3. 從班名括號解析 **體系別** 獨立欄位  
4. 與 TIS 只讀同步時，以 **九碼班代號 + seq** 做 upsert 鍵  

實作程式：`src/lib/tis-class-code.ts`、`prisma/schema.prisma`（`TrainingClass`）、`prisma/seed.ts`、API `POST /api/sync/import/classes`。
