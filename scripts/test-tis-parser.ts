/**
 * TIS parser 離線驗證
 *
 * 跑法：
 *   npx tsx scripts/test-tis-parser.ts
 *
 * 行為：掃 docs/reference-materials/.../115年開班計畫表/*.html，
 *       對每份呼叫 parseTisOpenClassListHtml；驗證每月份都解析到 > 0 班。
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

// 直接用相對路徑（避開 server-only import 帶來的問題）；不帶副檔名以符合
// Next.js 預設 tsconfig 的 allowImportingTsExtensions=false
import { parseTisOpenClassListHtml } from "../src/lib/tis/sync-parser";

const SAMPLE_DIR =
  "docs/reference-materials/「培訓師儀表板」模組/115年開班計畫表";

async function main() {
  const all = await readdir(SAMPLE_DIR);
  const htmls = all.filter((f) => f.endsWith(".html")).sort();

  if (htmls.length === 0) {
    console.error("找不到任何 HTML 樣本");
    process.exit(1);
  }

  let totalClasses = 0;
  let totalWarnings = 0;
  let monthsWithZero = 0;

  for (const file of htmls) {
    const path = join(SAMPLE_DIR, file);
    const html = await readFile(path, "utf-8");
    const t0 = Date.now();
    const page = parseTisOpenClassListHtml(html);
    const dt = Date.now() - t0;

    totalClasses += page.classes.length;
    totalWarnings += page.warnings.length;
    if (page.classes.length === 0) monthsWithZero++;

    const sample = page.classes[0];
    console.log(
      `[${file}]`,
      `yy=${page.yy} mm=${page.mm} dept=${page.department} classes=${page.classes.length} warns=${page.warnings.length} (${dt}ms)`
    );
    if (page.warnings.length > 0) {
      for (const w of page.warnings) console.log(`   ⚠ ${w}`);
    }
    if (sample) {
      console.log(
        `   sample: ${sample.classCode} | ${sample.className.slice(0, 30)} | ${
          sample.startDate
        } | ${sample.mentorName ?? "-"} | enroll=${sample.enrollmentCount ?? "-"} | seq=${
          sample.tisSeq ?? "-"
        }`
      );
    }
  }

  console.log("");
  console.log(
    `總計：${htmls.length} 月份、解析 ${totalClasses} 班、warnings ${totalWarnings}`
  );
  if (monthsWithZero > 0) {
    console.error(`❌ 有 ${monthsWithZero} 個月份解析到 0 班（parser 有問題）`);
    process.exit(2);
  } else {
    console.log("✅ 每個月份都有解析到班次");
  }
}

main().catch((e) => {
  console.error("test-tis-parser 失敗", e);
  process.exit(1);
});
