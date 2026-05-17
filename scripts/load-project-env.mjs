/**
 * 載入專案根目錄 .env，並覆寫已存在的 process.env（例如 Windows 使用者層級的 DATABASE_URL）。
 * 避免本機 Docker 殘留的 localhost:5432 蓋掉 Supabase 連線字串。
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

export function loadProjectEnv(root) {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  dotenv.config({ path: envPath, override: true });
}
