/**
 * 【清除 .next 建置快取】
 * 建置異常或換依賴時執行 `npm run clean`。須先關閉 dev server。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextDir = path.join(root, ".next");

try {
  fs.rmSync(nextDir, { recursive: true, force: true });
  console.log("已刪除 .next（Next.js 建置快取）。");
} catch (e) {
  console.error("無法刪除 .next：請先關閉 npm run dev / next build，必要時於工作管理員結束 node 程序後再試。");
  console.error(e);
  process.exit(1);
}
