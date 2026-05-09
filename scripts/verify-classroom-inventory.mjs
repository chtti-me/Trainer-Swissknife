#!/usr/bin/env node
/**
 * 驗證 src/data/classroom-inventory/*.json：
 *  - meta（基本資料）摘要：campusId / 標籤 / 教室數 / 來源檔 / 產生時間
 *  - 各樓別分布：間數 + 標準人數 / 最大容量區間
 *  - 教室性質統計：電腦／遠距／會議廳／實驗室 等
 *  - 15 項設備擁有率（V 個數 / 總數）
 *  - 健全性檢查：容量為 0、tisBuildingCode 缺失、roomId 重複、欄位 NaN 等
 *
 * 用法：
 *   node scripts/verify-classroom-inventory.mjs              # 全部所別
 *   node scripts/verify-classroom-inventory.mjs --only hq    # 只看院本部
 *   node scripts/verify-classroom-inventory.mjs --json       # 機器可讀 JSON 輸出
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const INVENTORY_DIR = path.join(REPO_ROOT, "src/data/classroom-inventory");

const CAMPUSES = [
  { id: "hq", label: "院本部（板橋）", file: "hq.json" },
  { id: "taichung", label: "台中所", file: "taichung.json" },
  { id: "kaohsiung", label: "高雄所", file: "kaohsiung.json" },
];

const EQUIP_LABELS_ZH = {
  projector: "投影機",
  overheadProjector: "單槍投射器",
  amplifier: "擴音器",
  recording: "錄音",
  vcr: "錄放影機",
  network: "網路",
  wallFan: "壁扇",
  camera: "攝影機",
  splitAC: "獨立空調",
  centralAC: "中央空調",
  deskMic: "桌上式麥克風",
  surveillance: "監視系統",
  infoPodium: "資訊講桌",
  holidayAC: "假日空調",
  digitalPen: "數位手寫板",
};

function parseArgs(argv) {
  let only = null;
  let asJson = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--only" && argv[i + 1]) only = argv[++i];
    else if (argv[i] === "--json") asJson = true;
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log(
        "用法: node scripts/verify-classroom-inventory.mjs [--only hq|taichung|kaohsiung] [--json]"
      );
      process.exit(0);
    }
  }
  return { only, asJson };
}

function loadInventory(file) {
  const abs = path.join(INVENTORY_DIR, file);
  if (!fs.existsSync(abs)) return { error: `找不到檔案：${abs}` };
  try {
    const txt = fs.readFileSync(abs, "utf8");
    return { data: JSON.parse(txt), absPath: abs };
  } catch (e) {
    return { error: `JSON 解析失敗（${file}）：${e.message}` };
  }
}

function summarizeCampus(campus, inventory) {
  const rooms = Array.isArray(inventory.rooms) ? inventory.rooms : [];
  const meta = inventory.meta || {};

  // 樓別分布
  const buildings = new Map();
  for (const r of rooms) {
    const key = `${r.buildingNameZh || "(未命名)"}#${r.tisBuildingCode || ""}`;
    if (!buildings.has(key)) {
      buildings.set(key, {
        nameZh: r.buildingNameZh || "(未命名)",
        tisBuildingCode: r.tisBuildingCode || "",
        count: 0,
        stdCapMin: Infinity,
        stdCapMax: -Infinity,
        maxCapMin: Infinity,
        maxCapMax: -Infinity,
      });
    }
    const b = buildings.get(key);
    b.count++;
    if (Number.isFinite(r.standardCapacity)) {
      b.stdCapMin = Math.min(b.stdCapMin, r.standardCapacity);
      b.stdCapMax = Math.max(b.stdCapMax, r.standardCapacity);
    }
    if (Number.isFinite(r.maxCapacity)) {
      b.maxCapMin = Math.min(b.maxCapMin, r.maxCapacity);
      b.maxCapMax = Math.max(b.maxCapMax, r.maxCapacity);
    }
  }

  // 教室性質統計
  const natureCounts = {
    普通教室: 0,
    電腦教室: 0,
    遠距教室: 0,
    會議廳: 0,
    階梯教室: 0,
    籃球場: 0,
    實驗室: 0,
    機房: 0,
    其他: 0,
    無註記: 0,
  };
  for (const r of rooms) {
    const n = r.nature || "";
    if (!n) {
      natureCounts.無註記++;
      continue;
    }
    let matched = false;
    for (const key of Object.keys(natureCounts)) {
      if (key !== "其他" && key !== "無註記" && n.includes(key)) {
        natureCounts[key]++;
        matched = true;
      }
    }
    if (!matched) natureCounts.其他++;
  }

  // 設備擁有率
  const equipmentCounts = {};
  for (const k of Object.keys(EQUIP_LABELS_ZH)) equipmentCounts[k] = 0;
  for (const r of rooms) {
    const eq = r.equipment || {};
    for (const k of Object.keys(equipmentCounts)) {
      if (eq[k]) equipmentCounts[k]++;
    }
  }

  // 健全性檢查
  const issues = [];
  const idSeen = new Map();
  for (const r of rooms) {
    if (!r.roomId) issues.push("發現缺少 roomId 的列");
    else {
      idSeen.set(r.roomId, (idSeen.get(r.roomId) || 0) + 1);
    }
    if (!Number.isFinite(r.standardCapacity) || r.standardCapacity < 0) {
      issues.push(`${r.roomId || "(無 ID)"} 的 standardCapacity 異常：${r.standardCapacity}`);
    }
    if (!Number.isFinite(r.maxCapacity) || r.maxCapacity < 0) {
      issues.push(`${r.roomId || "(無 ID)"} 的 maxCapacity 異常：${r.maxCapacity}`);
    }
    if (Number.isFinite(r.standardCapacity) && Number.isFinite(r.maxCapacity) && r.standardCapacity > r.maxCapacity) {
      issues.push(`${r.roomId} 的 標準人數(${r.standardCapacity}) > 最大容量(${r.maxCapacity})`);
    }
    if (!r.tisBuildingCode) {
      issues.push(`${r.roomId || "(無 ID)"}（${r.buildingNameZh || "未命名樓"}）缺 tisBuildingCode`);
    }
  }
  for (const [id, count] of idSeen.entries()) {
    if (count > 1) issues.push(`roomId 重複：${id}（出現 ${count} 次）`);
  }
  if (rooms.length === 0) {
    issues.push("rooms 為空陣列（占位檔，待匯入 TIS HTML 後執行 npm run data:tis-classrooms）");
  }
  if (rooms.length !== meta.roomCount) {
    issues.push(`meta.roomCount (${meta.roomCount}) 與實際筆數 (${rooms.length}) 不一致`);
  }

  return {
    campusId: campus.id,
    campusLabel: meta.campusLabel || campus.label,
    tisDepartmentCode: meta.tisDepartmentCode || "",
    sourceHtmlFile: meta.sourceHtmlFile || "(未指定)",
    generatedAt: meta.generatedAt || "(未指定)",
    roomCount: rooms.length,
    metaRoomCount: meta.roomCount ?? null,
    buildings: Array.from(buildings.values()).sort((a, b) =>
      a.tisBuildingCode.localeCompare(b.tisBuildingCode, "en", { numeric: true })
    ),
    natureCounts,
    equipmentCounts,
    issues,
  };
}

function pad(s, n) {
  const str = String(s);
  // 中文字寬度近似 2 半形
  let w = 0;
  for (const ch of str) w += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1;
  return str + " ".repeat(Math.max(0, n - w));
}

function printHumanReport(summary) {
  const head = `所別：${summary.campusLabel}（campusId=${summary.campusId} / TIS dept=${summary.tisDepartmentCode || "?"})`;
  console.log("\n" + "═".repeat(80));
  console.log(head);
  console.log("─".repeat(80));
  console.log(`教室總數：${summary.roomCount}（meta.roomCount=${summary.metaRoomCount}）`);
  console.log(`來源 HTML：${summary.sourceHtmlFile}`);
  console.log(`產生時間：${summary.generatedAt}`);

  if (summary.roomCount === 0) {
    console.log("\n  ⚠️  此檔為占位空檔，下方分布／設備統計皆為空。");
  } else {
    console.log("\n[ 各樓別分布 ]");
    console.log("  " + pad("樓別（中文）", 16) + pad("代碼", 8) + pad("間數", 6) + pad("標準人數區間", 16) + "最大容量區間");
    for (const b of summary.buildings) {
      const stdRange = b.stdCapMin === Infinity ? "-" : `${b.stdCapMin}–${b.stdCapMax}`;
      const maxRange = b.maxCapMin === Infinity ? "-" : `${b.maxCapMin}–${b.maxCapMax}`;
      console.log(
        "  " +
          pad(b.nameZh, 16) +
          pad(b.tisBuildingCode || "(空)", 8) +
          pad(b.count, 6) +
          pad(stdRange, 16) +
          maxRange
      );
    }

    console.log("\n[ 教室性質統計（同一間可同時計入多類別）]");
    for (const [k, v] of Object.entries(summary.natureCounts)) {
      if (v > 0) console.log("  " + pad(k, 14) + v);
    }

    console.log("\n[ 設備擁有率（V 個數 / 總數）]");
    for (const [k, count] of Object.entries(summary.equipmentCounts)) {
      const label = EQUIP_LABELS_ZH[k];
      const pct = summary.roomCount === 0 ? 0 : Math.round((count / summary.roomCount) * 100);
      const bar = "█".repeat(Math.round(pct / 5));
      console.log("  " + pad(label, 18) + pad(`${count}/${summary.roomCount}`, 10) + pad(`${pct}%`, 6) + bar);
    }
  }

  if (summary.issues.length > 0) {
    console.log("\n[ ⚠️ 健全性檢查 ]");
    for (const m of summary.issues) console.log("  - " + m);
  } else if (summary.roomCount > 0) {
    console.log("\n[ ✅ 健全性檢查通過 ]");
  }
}

function main() {
  const { only, asJson } = parseArgs(process.argv);
  const targets = only ? CAMPUSES.filter((c) => c.id === only) : CAMPUSES;
  if (targets.length === 0) {
    console.error(`找不到 campus id：${only}（可用：hq、taichung、kaohsiung）`);
    process.exit(1);
  }

  const allSummaries = [];
  let totalIssues = 0;

  for (const campus of targets) {
    const loaded = loadInventory(campus.file);
    if (loaded.error) {
      console.error(`❌ ${campus.label}（${campus.file}）：${loaded.error}`);
      totalIssues++;
      continue;
    }
    const summary = summarizeCampus(campus, loaded.data);
    allSummaries.push(summary);
    totalIssues += summary.issues.length;
    if (!asJson) printHumanReport(summary);
  }

  if (asJson) {
    console.log(JSON.stringify(allSummaries, null, 2));
    return;
  }

  console.log("\n" + "═".repeat(80));
  if (totalIssues === 0) {
    console.log("🎉 全部通過，沒有任何健全性疑慮。");
  } else {
    console.log(`⚠️ 共偵測到 ${totalIssues} 個提醒項目（含占位空檔的提示）。`);
  }
}

main();
