#!/usr/bin/env node
/**
 * 從 TIS「列印教室設備」類 HTML（QueryPrintClassroom.jsp 存檔）剖析教室列，輸出 JSON。
 * 板橋／台中／高雄共用同一剖析邏輯；各所大樓代碼對照請在 config 的 buildingTisCodeByNameZh 設定。
 *
 * 用法：
 *   node scripts/generate-tis-classroom-inventory.mjs
 *   node scripts/generate-tis-classroom-inventory.mjs --only hq
 *   node scripts/generate-tis-classroom-inventory.mjs --config scripts/tis-classroom-inventory.config.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const EQUIP_KEYS = [
  "projector",
  "overheadProjector",
  "amplifier",
  "recording",
  "vcr",
  "network",
  "wallFan",
  "camera",
  "splitAC",
  "centralAC",
  "deskMic",
  "surveillance",
  "infoPodium",
  "holidayAC",
  "digitalPen",
];

const EQUIP_LABELS_ZH = [
  "投影機",
  "單槍投射器",
  "擴音器",
  "錄音",
  "錄放影機",
  "網路",
  "壁扇",
  "攝影機",
  "獨立空調",
  "中央空調",
  "桌上式麥克風",
  "監視系統",
  "資訊講桌",
  "假日空調",
  "數位手寫板",
];

function parseArgs(argv) {
  let configPath = path.join(REPO_ROOT, "scripts/tis-classroom-inventory.config.json");
  let only = null;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--config" && argv[i + 1]) {
      configPath = path.resolve(REPO_ROOT, argv[++i]);
    } else if (argv[i] === "--only" && argv[i + 1]) {
      only = argv[++i];
    } else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log(`用法: node scripts/generate-tis-classroom-inventory.mjs [--config 路徑] [--only hq|taichung|kaohsiung]`);
      process.exit(0);
    }
  }
  return { configPath, only };
}

function extractSourceUrl(html) {
  const m = html.match(/url:\s*(https?:\/\/[^\s]+)/i);
  return m ? m[1].replace(/[\s>].*$/, "") : "https://tis.cht.com.tw/jap/classroom/QueryPrintClassroom.jsp";
}

/**
 * @param {string} html
 * @param {Record<string, string>} buildingTisCodeByNameZh
 */
function parseRooms(html, buildingTisCodeByNameZh) {
  let currentBuildingName = "";
  let currentTisCode = "";
  const rows = [];

  // 與 TIS 匯出 HTML 一致：大樓區塊標題列
  const chunks = html.split(/<tr bgcolor=#CCCCCC><td colspan=4>/i);
  for (let i = 1; i < chunks.length; i++) {
    const headerText = chunks[i].split("<")[0].trim();
    if (headerText) {
      currentBuildingName = headerText;
      currentTisCode = buildingTisCodeByNameZh[headerText] ?? "";
      if (!currentTisCode && Object.keys(buildingTisCodeByNameZh).length > 0) {
        console.warn(`[警告] 大樓「${headerText}」未在 buildingTisCodeByNameZh 對照，tisBuildingCode 將為空字串。`);
      }
    }

    const subparts = chunks[i].split(/name=roomid value=/).slice(1);
    for (const p of subparts) {
      const vid = p.match(/^([A-Z0-9]+)/);
      if (!vid) continue;
      const roomId = vid[1];
      const rest = p.slice(roomId.length);
      const d1 = rest.match(
        /^><\/td>\s*<td>([^<]+)<\/td>\s*<td>([^<]*)<\/td>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(\d+)<\/td>/,
      );
      if (!d1) continue;
      const [, displayCode, nature, stdCap, maxCap] = d1;
      const afterCap = rest.slice(d1[0].length);
      const tokens = afterCap
        .split(/<td>/)
        .slice(1)
        .map((s) => s.replace(/<\/td>.*/s, "").trim())
        .filter((t) => t === "V" || t === "-");
      const equipCells = tokens.slice(0, 15).map((t) => t === "V");
      while (equipCells.length < 15) equipCells.push(false);

      /** @type {Record<string, boolean>} */
      const equipment = {};
      EQUIP_KEYS.forEach((k, idx) => {
        equipment[k] = equipCells[idx] ?? false;
      });

      const natureStr = nature.trim();
      const tags = natureStr ? natureStr.split(",").map((s) => s.trim()).filter(Boolean) : [];

      rows.push({
        roomId,
        displayCode: displayCode.trim(),
        nature: natureStr,
        tags,
        isComputerClassroom: /電腦教室/.test(natureStr),
        isDistanceClassroom: /遠距/.test(natureStr),
        buildingNameZh: currentBuildingName,
        tisBuildingCode: currentTisCode,
        standardCapacity: Number(stdCap),
        maxCapacity: Number(maxCap),
        equipment,
      });
    }
  }

  return rows;
}

function buildEquipmentFieldLabelsZh() {
  /** @type {Record<string, string>} */
  const o = {};
  EQUIP_KEYS.forEach((k, i) => {
    o[k] = EQUIP_LABELS_ZH[i];
  });
  return o;
}

async function main() {
  const { configPath, only } = parseArgs(process.argv);

  const raw = fs.readFileSync(configPath, "utf8");
  const config = JSON.parse(raw);
  const sources = Array.isArray(config.sources) ? config.sources : [];

  const filtered = only ? sources.filter((s) => s.id === only) : sources;
  if (only && filtered.length === 0) {
    console.error(`找不到 id 為「${only}」的來源。`);
    process.exit(1);
  }

  for (const source of filtered) {
    const id = source.id;
    const inputHtml = source.inputHtml;
    const outputJson = source.outputJson;
    const campusLabelZh = source.campusLabelZh ?? id;
    const tisDepartmentCode = source.tisDepartmentCode ?? "";
    const buildingMap = source.buildingTisCodeByNameZh && typeof source.buildingTisCodeByNameZh === "object"
      ? source.buildingTisCodeByNameZh
      : {};

    if (inputHtml == null || String(inputHtml).trim() === "") {
      console.log(`[略過] ${id}：未設定 inputHtml（請匯入 TIS 存檔後再填路徑）。`);
      continue;
    }

    const absHtml = path.resolve(REPO_ROOT, inputHtml);
    if (!fs.existsSync(absHtml)) {
      console.error(`[略過] ${id}：找不到 HTML 檔：${absHtml}`);
      continue;
    }

    const html = fs.readFileSync(absHtml, "utf8");
    const rooms = parseRooms(html, buildingMap);
    const relHtml = inputHtml.replace(/\\/g, "/").replace(/^\/+/, "");

    const out = {
      meta: {
        sourcePageUrl: extractSourceUrl(html),
        sourceHtmlFile: relHtml,
        campusId: id,
        tisDepartmentCode,
        campusLabel: campusLabelZh,
        description:
          `TIS 教室設備列表頁（QueryPrintClassroom）存檔剖析；campusId=${id}。`,
        roomCount: rooms.length,
        generatedAt: new Date().toISOString(),
        equipmentFieldLabelsZh: buildEquipmentFieldLabelsZh(),
      },
      rooms,
    };

    const absOut = path.resolve(REPO_ROOT, outputJson);
    fs.mkdirSync(path.dirname(absOut), { recursive: true });
    fs.writeFileSync(absOut, JSON.stringify(out, null, 2), "utf8");
    console.log(`[完成] ${id} → ${outputJson}（${rooms.length} 間教室）`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
