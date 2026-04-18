/**
 * 【TIS 班代號解析】
 * 把像 CR24CE014 這種字串拆成場域碼、期別等，必要時推論課程類別。
 * 比喻：拆郵遞區號——前幾碼代表區域，後幾碼代表細項。
 * 規格參考：docs/reference-materials/…/開班計畫表-列表、查詢網址.txt
 */

export type TisClassCodePattern = "standard" | "extended" | "unknown";

export type ParsedTisClassCode = {
  /** 五碼班別代號（classid） */
  tisClassId5: string;
  /** 第六碼：P 板橋院本部、T 台中所、K 高雄所、E 全 e 課程 */
  tisVenueCode: string;
  /** 三位數期別（sessions） */
  tisSessionCode: string;
  /** 擴充格式時：1 基礎／2 進階／3 高級／4 專精；標準九碼時為 null */
  tisDifficultyDigit: number | null;
  pattern: TisClassCodePattern;
};

const VENUE_CODES = new Set(["P", "T", "K", "E"]);

/** 標準九碼：前五碼 + 場域一碼 (P|T|K|E) + 三位期別 */
const RE_STANDARD = /^(.{5})([PTKE])(\d{3})$/i;

/**
 * 擴充十碼（若貴單位實際採用）：前五碼 + 難易度數字(1–4) + 場域一碼 + 三位期別
 * 例：CR24E2P099 → CR24E、2、P、099
 */
const RE_EXTENDED = /^(.{5})([1-4])([PTKE])(\d{3})$/i;

export function parseTisClassCode(raw: string | null | undefined): ParsedTisClassCode | null {
  if (raw == null || typeof raw !== "string") return null;
  const code = raw.trim().replace(/\s+/g, "").toUpperCase();
  if (code.length < 9) return null;

  const ext = code.match(RE_EXTENDED);
  if (ext) {
    const venue = ext[3].toUpperCase();
    if (!VENUE_CODES.has(venue)) return null;
    return {
      tisClassId5: ext[1],
      tisDifficultyDigit: parseInt(ext[2], 10),
      tisVenueCode: venue,
      tisSessionCode: ext[4],
      pattern: "extended",
    };
  }

  const std = code.match(RE_STANDARD);
  if (std) {
    const venue = std[2].toUpperCase();
    if (!VENUE_CODES.has(venue)) return null;
    return {
      tisClassId5: std[1],
      tisVenueCode: venue,
      tisSessionCode: std[3],
      tisDifficultyDigit: null,
      pattern: "standard",
    };
  }

  return null;
}

export function tisDifficultyDigitToLevel(d: number | null | undefined): string | null {
  if (d == null || Number.isNaN(d)) return null;
  switch (d) {
    case 1:
      return "基礎";
    case 2:
      return "進階";
    case 3:
      return "高級";
    case 4:
      return "專精";
    default:
      return null;
  }
}

/** 由場域碼建議院所別（與種子／UI 慣用中文一致） */
export function tisVenueCodeToCampus(venue: string | null | undefined): string | null {
  if (!venue) return null;
  const v = venue.toUpperCase();
  if (v === "P") return "院本部";
  if (v === "T") return "台中所";
  if (v === "K") return "高雄所";
  if (v === "E") return "全e課程";
  return null;
}

/** 由場域碼建議開班方式（僅供匯入時補齊，非強制） */
export function tisVenueCodeToDeliveryMode(venue: string | null | undefined): string | null {
  if (!venue) return null;
  const v = venue.toUpperCase();
  if (v === "E") return "遠距";
  return null;
}

/**
 * 依班名推論課程類別（category）；無法判斷時回傳 null。
 * 規則為啟發式（heuristic），需與實際學院分類對齊時可再調整關鍵字順序或詞典。
 */
export function inferCategoryFromClassName(className: string | null | undefined): string | null {
  if (!className || !className.trim()) return null;
  const name = className.trim();

  const rules: Array<{ category: string; test: (s: string) => boolean }> = [
    {
      category: "資訊安全",
      test: (s) =>
        /資安|資通安全|資訊安全|網路安全|個資|資安法|安全程式碼|漏洞|威脅|SOC|SIEM|零信任|入侵|鑑識|封包分析|資安治理|合規|防火牆|VPN/i.test(
          s
        ),
    },
    {
      category: "數位轉型",
      test: (s) =>
        /AI|人工智慧|機器學習|深度學習|生成式|Copilot|M365|Azure|雲端|大數據|資料治理|資料庫(?!效能)|DevOps|CI\/CD|容器|Kubernetes|區塊鏈|Python|數位轉型/i.test(
          s
        ),
    },
    {
      category: "網路技術",
      test: (s) =>
        /5G|核心網|行動通訊|光纖|SDN|網路技術|電信網|TCP|IP|資料庫效能|DBA|效能調校/i.test(s),
    },
    {
      category: "管理技能",
      test: (s) =>
        /專案管理|敏捷|Scrum|Kanban|行銷|簡報|表達|溝通|領導|管理技能|人力資源|教練/i.test(s),
    },
  ];

  for (const { category, test } of rules) {
    if (test(name)) return category;
  }
  return null;
}

/** 合併解析結果為 Prisma TrainingClass 可寫入之欄位（不含 classCode 本身） */
export function prismaFieldsFromTisClassCode(classCode: string | null | undefined): {
  tisClassId5: string | null;
  tisVenueCode: string | null;
  tisSessionCode: string | null;
  tisDifficultyDigit: number | null;
} {
  const p = parseTisClassCode(classCode);
  if (!p) {
    return {
      tisClassId5: null,
      tisVenueCode: null,
      tisSessionCode: null,
      tisDifficultyDigit: null,
    };
  }
  return {
    tisClassId5: p.tisClassId5,
    tisVenueCode: p.tisVenueCode,
    tisSessionCode: p.tisSessionCode,
    tisDifficultyDigit: p.tisDifficultyDigit,
  };
}

/** CSV／表單匯入一列時：補齊 TIS 解析欄位、班名推論類別、場域預設開班方式 */
export function enrichImportedClassRow(row: {
  classCode?: string | null;
  className: string;
  campus?: string | null;
  category?: string | null;
  difficultyLevel?: string | null;
  deliveryMode?: string | null;
}): {
  classCode: string | null;
  className: string;
  campus: string | null;
  category: string | null;
  difficultyLevel: string | null;
  deliveryMode: string | null;
  tisClassId5: string | null;
  tisVenueCode: string | null;
  tisSessionCode: string | null;
  tisDifficultyDigit: number | null;
} {
  const classCode = row.classCode?.trim() || null;
  const tis = prismaFieldsFromTisClassCode(classCode);
  const inferredCat = inferCategoryFromClassName(row.className);
  const category = row.category?.trim() || inferredCat || null;
  const campusFromCode = tisVenueCodeToCampus(tis.tisVenueCode);
  const campus = row.campus?.trim() || campusFromCode || null;
  let deliveryMode = row.deliveryMode?.trim() || null;
  if (tis.tisVenueCode === "E" && !deliveryMode) {
    deliveryMode = tisVenueCodeToDeliveryMode("E") ?? "遠距";
  }
  const difficultyLevel =
    tisDifficultyDigitToLevel(tis.tisDifficultyDigit) ||
    row.difficultyLevel?.trim() ||
    null;

  return {
    classCode,
    className: row.className.trim(),
    campus,
    category,
    difficultyLevel,
    deliveryMode,
    ...tis,
  };
}
