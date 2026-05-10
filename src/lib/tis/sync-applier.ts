import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enrichImportedClassRow } from "@/lib/tis-class-code";
import type { TisParsedClass } from "./sync-parser";

/**
 * 【TIS 同步應用層】把 parser 解析出的班次與既有 DB 比對，產 dry-run diff，
 * 並提供 apply()（confirm 階段呼叫）真正寫入。
 *
 * upsert 鍵設計：
 *   1. 第一順位：classCode（完整九/十碼）
 *   2. 若 classCode < 8 碼（TIS「未建置」班只有 6 碼，期別未配發）→ 用
 *      `sourceSystemId = "tis-seq:<seq>"` 當主鍵；無 seq 則用 `tis-pending:<classCode>:<startDate>`
 *      理由：未建置班還沒分配期別，classCode 之後可能變動；但 seq 在 TIS 內是穩定 ID
 */

export type DiffAction = "create" | "update" | "noop";

export interface ClassDiffEntry {
  /** parser 解析來源 row */
  parsed: TisParsedClass;
  /** 應該對應到 DB 的哪一筆（找到才填）*/
  matchedDbId: string | null;
  /** 比對到的 key 種類 */
  matchedBy: "classCode" | "tisSeq" | "none";
  action: DiffAction;
  /** 預定 upsert 的「最終欄位值」 */
  toWrite: PrismaTrainingClassUpsertFields;
  /** 哪些欄位被改動了（update 才有；create 一律全部） */
  changedFields: string[];
  /** 因「使用者手動覆寫保護」而被跳過的欄位（update 才會非空） */
  skippedByManualOverride: string[];
}

export interface SyncDiffSummary {
  totalParsed: number;
  toCreate: number;
  toUpdate: number;
  noop: number;
  /** 按月份分組統計 */
  byMonth: Array<{ key: string; total: number; create: number; update: number; noop: number }>;
}

export interface SyncDiff {
  summary: SyncDiffSummary;
  entries: ClassDiffEntry[];
}

export interface PrismaTrainingClassUpsertFields {
  sourceSystemId: string | null;
  classCode: string | null;
  tisClassId5: string | null;
  tisVenueCode: string | null;
  tisSessionCode: string | null;
  tisDifficultyDigit: number | null;
  className: string;
  campus: string | null;
  category: string | null;
  difficultyLevel: string | null;
  deliveryMode: string | null;
  startDatetime: Date | null;
  mentorName: string | null;
  status: string;
  sourceType: string;
  rawPayload: string | null;
}

const SYNC_SOURCE_TYPE = "tis_html_upload";

function classCodeIsComplete(code: string): boolean {
  // 九碼或十碼才算完整（已配發期別）；六碼是「未建置」
  return /^[A-Z0-9]{9,12}$/i.test(code);
}

function startDateToDateTime(iso: string | null): Date | null {
  if (!iso) return null;
  // ISO yyyy-mm-dd → 視為當天 00:00 台北時間（UTC+8）
  // 用 `T00:00:00+08:00` 確保跨時區一致
  try {
    const dt = new Date(`${iso}T00:00:00+08:00`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  } catch {
    return null;
  }
}

function buildSourceSystemId(p: TisParsedClass): string | null {
  if (p.tisSeq) return `tis-seq:${p.tisSeq}`;
  if (!classCodeIsComplete(p.classCode) && p.startDate) {
    return `tis-pending:${p.classCode}:${p.startDate}`;
  }
  return null;
}

function buildUpsertFields(p: TisParsedClass): PrismaTrainingClassUpsertFields {
  // 用 enrichImportedClassRow 補齊 campus/category/difficultyLevel
  const enriched = enrichImportedClassRow({
    classCode: p.classCode,
    className: p.className,
  });

  // 「未建置」的班次狀態映射為「規劃中」；「已核定」映射為「已排定」；其他保留原狀態文字
  let mappedStatus = "規劃中";
  if (p.status === "已核定") mappedStatus = "已排定";
  else if (p.status === "已結訓") mappedStatus = "已結訓";
  else if (p.status === "進行中" || p.status === "上課中") mappedStatus = "即將開班";
  else if (p.status === "未建置") mappedStatus = "規劃中";

  return {
    sourceSystemId: buildSourceSystemId(p),
    classCode: enriched.classCode,
    tisClassId5: enriched.tisClassId5,
    tisVenueCode: enriched.tisVenueCode,
    tisSessionCode: enriched.tisSessionCode,
    tisDifficultyDigit: enriched.tisDifficultyDigit,
    className: enriched.className,
    campus: enriched.campus,
    category: enriched.category,
    difficultyLevel: enriched.difficultyLevel,
    deliveryMode: enriched.deliveryMode,
    startDatetime: startDateToDateTime(p.startDate),
    mentorName: p.mentorName,
    status: mappedStatus,
    sourceType: SYNC_SOURCE_TYPE,
    rawPayload: JSON.stringify({
      tisSeq: p.tisSeq,
      academyStream: p.academyStream,
      inlineTags: p.inlineTags,
      sectionTitle: p.sectionTitle,
      sectionVenue: p.sectionVenue,
      sectionDomain: p.sectionDomain,
      enrollmentText: p.enrollmentText,
      enrollmentCount: p.enrollmentCount,
      links: p.links,
      rawSdate: p.rawSdate,
      rawStatus: p.status,
    }),
  };
}

const COMPARE_FIELDS: Array<keyof PrismaTrainingClassUpsertFields> = [
  "classCode",
  "tisClassId5",
  "tisVenueCode",
  "tisSessionCode",
  "tisDifficultyDigit",
  "className",
  "campus",
  "category",
  "difficultyLevel",
  "deliveryMode",
  "startDatetime",
  "mentorName",
  "status",
];

function fieldEquals(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a == null && b == null) return true;
  return a === b;
}

/**
 * 從 manualOverrides JSON 讀出「使用者手動覆寫過」的欄位 set。
 * 容錯：null / 不是 object / 不是 boolean=true 一律視為未覆寫。
 */
function getManualOverrideKeys(raw: unknown): Set<string> {
  const out = new Set<string>();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === true) out.add(k);
  }
  return out;
}

/**
 * COMPARE_FIELDS 中、TIS sync 會更新到的欄位（subset）；
 * 這份清單是「使用者手動覆寫後 TIS sync 應該跳過」的候選。
 *
 * 識別碼類欄位（classCode / tisClassId5 等）即使被手動改過也不允許保留覆寫，
 * 因為這會讓配對機制壞掉，所以排除在此清單之外。
 */
const TIS_SYNC_PROTECTABLE_FIELDS: Array<keyof PrismaTrainingClassUpsertFields> = [
  "className",
  "campus",
  "category",
  "difficultyLevel",
  "deliveryMode",
  "startDatetime",
  "mentorName",
  "status",
];

/**
 * 計算 dry-run diff（不寫 DB）
 *
 * @param parsed parser 解析出的全部班次（已合併去重）
 */
export async function computeDiff(parsed: TisParsedClass[]): Promise<SyncDiff> {
  if (parsed.length === 0) {
    return {
      summary: { totalParsed: 0, toCreate: 0, toUpdate: 0, noop: 0, byMonth: [] },
      entries: [],
    };
  }

  // 兩種查詢都做：classCode IN (...) 與 sourceSystemId IN (...)
  const completeClassCodes: string[] = [];
  const sourceSystemIds: string[] = [];
  for (const p of parsed) {
    if (classCodeIsComplete(p.classCode)) completeClassCodes.push(p.classCode);
    const ssid = buildSourceSystemId(p);
    if (ssid) sourceSystemIds.push(ssid);
  }

  const dbRowsRaw = await prisma.trainingClass.findMany({
    where: {
      OR: [
        completeClassCodes.length > 0 ? { classCode: { in: completeClassCodes } } : undefined,
        sourceSystemIds.length > 0 ? { sourceSystemId: { in: sourceSystemIds } } : undefined,
      ].filter((c): c is NonNullable<typeof c> => c !== undefined),
    },
    select: {
      id: true,
      sourceSystemId: true,
      classCode: true,
      tisClassId5: true,
      tisVenueCode: true,
      tisSessionCode: true,
      tisDifficultyDigit: true,
      className: true,
      campus: true,
      category: true,
      difficultyLevel: true,
      deliveryMode: true,
      startDatetime: true,
      mentorName: true,
      status: true,
      manualOverrides: true,
    },
  });

  const byClassCode = new Map<string, (typeof dbRowsRaw)[number]>();
  const bySsid = new Map<string, (typeof dbRowsRaw)[number]>();
  for (const r of dbRowsRaw) {
    if (r.classCode) byClassCode.set(r.classCode, r);
    if (r.sourceSystemId) bySsid.set(r.sourceSystemId, r);
  }

  const entries: ClassDiffEntry[] = [];
  let toCreate = 0;
  let toUpdate = 0;
  let noop = 0;
  const byMonthMap = new Map<string, { total: number; create: number; update: number; noop: number }>();

  for (const p of parsed) {
    const toWrite = buildUpsertFields(p);
    let matched: (typeof dbRowsRaw)[number] | null = null;
    let matchedBy: ClassDiffEntry["matchedBy"] = "none";

    if (classCodeIsComplete(p.classCode) && byClassCode.has(p.classCode)) {
      matched = byClassCode.get(p.classCode)!;
      matchedBy = "classCode";
    } else if (toWrite.sourceSystemId && bySsid.has(toWrite.sourceSystemId)) {
      matched = bySsid.get(toWrite.sourceSystemId)!;
      matchedBy = "tisSeq";
    }

    let action: DiffAction = "create";
    const changedFields: string[] = [];
    const skippedByManualOverride: string[] = [];

    if (matched) {
      // 取出此筆已被手動覆寫的欄位 set；TIS sync 會跳過這些 key
      const overrideKeys = getManualOverrideKeys(matched.manualOverrides as unknown);

      for (const f of COMPARE_FIELDS) {
        const dbVal = (matched as unknown as Record<string, unknown>)[f];
        const newVal = toWrite[f];
        if (fieldEquals(dbVal, newVal)) continue;

        // 若使用者手動覆寫過此欄位 + 此欄位在「可保護清單」內 → 跳過、不算入 changedFields
        if (overrideKeys.has(f) && (TIS_SYNC_PROTECTABLE_FIELDS as string[]).includes(f)) {
          skippedByManualOverride.push(f);
          continue;
        }
        changedFields.push(f);
      }
      action = changedFields.length > 0 ? "update" : "noop";
    } else {
      // create 視為「全欄位變更」，UI 顯示時可摺疊
      for (const f of COMPARE_FIELDS) changedFields.push(f);
    }

    if (action === "create") toCreate++;
    else if (action === "update") toUpdate++;
    else noop++;

    const monthKey = p.startDate ? p.startDate.slice(0, 7) : "unknown";
    const m = byMonthMap.get(monthKey) ?? { total: 0, create: 0, update: 0, noop: 0 };
    m.total++;
    if (action === "create") m.create++;
    else if (action === "update") m.update++;
    else m.noop++;
    byMonthMap.set(monthKey, m);

    entries.push({
      parsed: p,
      matchedDbId: matched?.id ?? null,
      matchedBy,
      action,
      toWrite,
      changedFields,
      skippedByManualOverride,
    });
  }

  return {
    summary: {
      totalParsed: parsed.length,
      toCreate,
      toUpdate,
      noop,
      byMonth: Array.from(byMonthMap.entries())
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => a.key.localeCompare(b.key)),
    },
    entries,
  };
}

export interface ApplyResult {
  syncJobId: string;
  totalCount: number;
  createdCount: number;
  updatedCount: number;
  noopCount: number;
  failedCount: number;
  errors: Array<{ classCode: string; message: string }>;
}

/**
 * 真正執行 upsert + 記 SyncJob。
 * 在事務外做：每筆獨立 try，避免單筆失敗讓全部 rollback（部分匯入也比全失敗好）。
 */
export async function applyDiff(
  diff: SyncDiff,
  meta: { sourceName: string }
): Promise<ApplyResult> {
  const job = await prisma.syncJob.create({
    data: {
      sourceName: meta.sourceName,
      syncMode: "tis_html_upload",
      status: "running",
      totalCount: diff.entries.length,
    },
  });

  let created = 0;
  let updated = 0;
  let noop = 0;
  let failed = 0;
  const errors: Array<{ classCode: string; message: string }> = [];

  for (const entry of diff.entries) {
    if (entry.action === "noop") {
      noop++;
      continue;
    }
    try {
      // 把這次 TIS sync「想寫入」的可保護欄位值記下來，供「還原為 TIS 值」功能讀取
      // （無論 create 或 update 都記，這樣使用者改錯後可以還原到 TIS 最新值）
      const tisOriginalValues: Record<string, unknown> = {};
      for (const f of TIS_SYNC_PROTECTABLE_FIELDS) {
        const v = entry.toWrite[f];
        // Date 統一轉 ISO 字串方便 JSON 持久化、也方便前端處理
        tisOriginalValues[f] = v instanceof Date ? v.toISOString() : v;
      }

      if (entry.action === "create") {
        await prisma.trainingClass.create({
          data: {
            ...entry.toWrite,
            importedAt: new Date(),
            tisOriginalValues: tisOriginalValues as Prisma.InputJsonValue,
          } as Prisma.TrainingClassUncheckedCreateInput,
        });
        created++;
      } else if (entry.action === "update" && entry.matchedDbId) {
        // 把被手動覆寫保護的欄位從 toWrite 中移除，這樣 update 不會動到它們
        const writeData: Record<string, unknown> = { ...entry.toWrite };
        for (const f of entry.skippedByManualOverride) {
          delete writeData[f];
        }
        await prisma.trainingClass.update({
          where: { id: entry.matchedDbId },
          data: {
            ...writeData,
            importedAt: new Date(),
            // tisOriginalValues 一定要更新（即使欄位被保護沒寫入主 column）
            // 這樣 UI 上「還原為 TIS 值」功能能讀到「TIS 最新版」
            tisOriginalValues: tisOriginalValues as Prisma.InputJsonValue,
          } as Prisma.TrainingClassUncheckedUpdateInput,
        });
        updated++;
      }
    } catch (e) {
      failed++;
      errors.push({
        classCode: entry.parsed.classCode,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const status = failed === 0 ? "success" : created + updated > 0 ? "partial" : "failed";
  const logLines = [
    `total=${diff.entries.length} created=${created} updated=${updated} noop=${noop} failed=${failed}`,
    ...errors.slice(0, 50).map((e) => `[FAIL] ${e.classCode}: ${e.message}`),
  ];

  await prisma.syncJob.update({
    where: { id: job.id },
    data: {
      finishedAt: new Date(),
      status,
      successCount: created + updated,
      failedCount: failed,
      logText: logLines.join("\n").slice(0, 8000),
    },
  });

  return {
    syncJobId: job.id,
    totalCount: diff.entries.length,
    createdCount: created,
    updatedCount: updated,
    noopCount: noop,
    failedCount: failed,
    errors,
  };
}
