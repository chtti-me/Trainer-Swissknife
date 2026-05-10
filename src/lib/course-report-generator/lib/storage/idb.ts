/**
 * 【課程規劃報告產生器 - IndexedDB 儲存】
 *
 * 用 idb-keyval 把：
 *   - 整份報告 JSON（草稿）→ DB=`trainer-swissknife-course-report` / store=`drafts`
 *   - 上傳檔案 Blob       → DB=`trainer-swissknife-course-report-files` / store=`files`
 * 兩者都按使用者帳號區隔，避免不同人共用同一份草稿。
 *
 * ⚠️ 重要：兩個 store 必須用「不同 DB name」（不是同 DB 的兩個 store）。
 *
 * 原因：idb-keyval 的 `createStore(dbName, storeName)` 內部 `indexedDB.open(dbName)`
 * 沒給 version（預設 1），所以同一個 DB 第二次 createStore 不會再觸發
 * `onupgradeneeded`，第二個 object store 永遠不會被建立 → 之後所有
 * `transaction(secondStoreName, ...)` 都會丟 NotFoundError。
 *
 * 之前的版本兩個 store 共用 DB「trainer-swissknife-course-report」，導致
 * `files` store 從建立時就壞掉 → 上傳後檔案沒存進 IDB、刪除按鈕無法觸發
 * removeUpload、AI 解析時找不到圖片 base64 等一系列 UI 卡死問題。
 *
 * 注意：所有方法只能在瀏覽器執行（用到 indexedDB），呼叫端請確保在 client component 中使用。
 */
import { createStore, get, set, del, keys } from "idb-keyval";
import type { CourseReport } from "../../types/report";

const DRAFT_DB = "trainer-swissknife-course-report";
const DRAFT_STORE = "drafts";
// 為避開 idb-keyval「同 DB 多 store」陷阱，files 用獨立 DB name。
const FILE_DB = "trainer-swissknife-course-report-files";
const FILE_STORE = "files";

// idb-keyval 在每個 createStore 都會自己開 IDB connection。
// 用 lazy init 避免 SSR 時就建好。
let _draftStore: ReturnType<typeof createStore> | null = null;
let _fileStore: ReturnType<typeof createStore> | null = null;

function getDraftStore() {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB 只能在瀏覽器使用");
  }
  if (!_draftStore) _draftStore = createStore(DRAFT_DB, DRAFT_STORE);
  return _draftStore;
}

function getFileStore() {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB 只能在瀏覽器使用");
  }
  if (!_fileStore) _fileStore = createStore(FILE_DB, FILE_STORE);
  return _fileStore;
}

const draftKey = (userId: string) => `draft:${userId || "anonymous"}`;
const fileKey = (userId: string, fileId: string) => `file:${userId || "anonymous"}:${fileId}`;

// ─────────────────────────── 草稿 ───────────────────────────

export async function loadDraft(userId: string): Promise<CourseReport | null> {
  try {
    const v = await get<CourseReport>(draftKey(userId), getDraftStore());
    return v ?? null;
  } catch (err) {
    console.warn("[course-report idb] loadDraft 失敗：", err);
    return null;
  }
}

export async function saveDraft(userId: string, report: CourseReport): Promise<void> {
  try {
    await set(draftKey(userId), report, getDraftStore());
  } catch (err) {
    console.warn("[course-report idb] saveDraft 失敗：", err);
  }
}

export async function deleteDraft(userId: string): Promise<void> {
  try {
    await del(draftKey(userId), getDraftStore());
  } catch (err) {
    console.warn("[course-report idb] deleteDraft 失敗：", err);
  }
}

// ─────────────────────────── 檔案 ───────────────────────────

export async function saveFile(userId: string, fileId: string, blob: Blob): Promise<void> {
  await set(fileKey(userId, fileId), blob, getFileStore());
}

export async function loadFile(userId: string, fileId: string): Promise<Blob | null> {
  const v = await get<Blob>(fileKey(userId, fileId), getFileStore());
  return v ?? null;
}

export async function deleteFile(userId: string, fileId: string): Promise<void> {
  await del(fileKey(userId, fileId), getFileStore());
}

/** 列出某使用者所有上傳檔案的 IDB 內部 key（debug 用） */
export async function listFileKeys(userId: string): Promise<string[]> {
  const all = await keys(getFileStore());
  const prefix = `file:${userId || "anonymous"}:`;
  return all.filter((k): k is string => typeof k === "string" && k.startsWith(prefix));
}

/** 把 IDB 中的檔案讀成 ObjectURL（用於 <img> 預覽） */
export async function loadFileAsObjectUrl(userId: string, fileId: string): Promise<string | null> {
  const blob = await loadFile(userId, fileId);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}
