/**
 * 【產生 y115-open-classes.json】
 * 掃描 reference HTML 目錄、解析後合併去重，寫入 prisma/data/…json 供 seed 讀取。
 * 執行：`npx tsx prisma/generate-y115-open-class-json.ts`
 */
import * as fs from "fs";
import * as path from "path";
import { parseOpenClassHtmlDocument, type ParsedOpenClassRow } from "./lib/parse-open-class-html";

const ROOT = path.resolve(__dirname, "..");
const HTML_DIR = path.join(
  ROOT,
  "docs",
  "reference-materials",
  "「培訓師儀表板」模組",
  "115年開班計畫表"
);
const OUT = path.join(__dirname, "data", "y115-open-classes.json");

function main() {
  if (!fs.existsSync(HTML_DIR)) {
    console.error("找不到 HTML 目錄:", HTML_DIR);
    process.exit(1);
  }

  const files = fs
    .readdirSync(HTML_DIR)
    .filter((f) => f.toLowerCase().endsWith(".html"))
    .sort();

  const bySeq = new Map<string, ParsedOpenClassRow>();
  for (const file of files) {
    const full = path.join(HTML_DIR, file);
    const html = fs.readFileSync(full, "utf-8");
    const rows = parseOpenClassHtmlDocument(html, file);
    for (const r of rows) {
      bySeq.set(r.seq, r);
    }
  }

  const unique = [...bySeq.values()];
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(unique, null, 2), "utf-8");
  console.log(`已寫入 ${unique.length} 筆（依 seq 去重）→ ${OUT}`);
  console.log("來源檔案數:", files.length);
}

main();
