/**
 * 【單一班次 API】
 *   GET：依 id 取詳情（含 trainer）；權限為管理員或負責培訓師。
 *   PUT：partial update。允許編輯的欄位見 EDITABLE_FIELDS；
 *        會同時把寫入欄位 mark 進 manualOverrides，讓下次 TIS sync 不蓋掉。
 *        傳 { restore: ["campus","deliveryMode"] } 可把指定欄位還原為 tisOriginalValues 的值，
 *        並從 manualOverrides 移除（之後恢復受 TIS sync 同步管理）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const { id } = await params;

  const cls = await prisma.trainingClass.findUnique({
    where: { id },
    include: {
      trainer: { select: { name: true, department: true, email: true } },
    },
  });

  if (!cls) {
    return NextResponse.json({ error: "找不到班次" }, { status: 404 });
  }

  const role = (session.user as { role?: string }).role;
  const userId = (session.user as { id?: string }).id;
  if (role !== "admin" && cls.trainerUserId !== userId) {
    return NextResponse.json({ error: "無權檢視此班次" }, { status: 403 });
  }

  // 若 ORM 未帶出 mentorName，直接以原生 SQL 讀 mentor_name 欄位（避免詳情顯示「-」但資料庫實際有值）
  let mentorName = cls.mentorName;
  if (!mentorName?.trim()) {
    const rows = await prisma.$queryRaw<Array<{ mentor_name: string | null }>>`
      SELECT mentor_name FROM training_classes WHERE id = ${cls.id}
    `;
    mentorName = rows[0]?.mentor_name ?? null;
  }

  return NextResponse.json({ ...cls, mentorName });
}

/**
 * 可被使用者編輯的欄位清單。
 * 識別碼類（id / classCode / tisClassId5 等）與 metadata（embedding / sourceType / 時間戳）
 * 一律不開放，避免破壞配對機制與審計可信度。
 */
const EDITABLE_FIELDS = [
  "className",
  "campus",
  "category",
  "classType",
  "difficultyLevel",
  "deliveryMode",
  "startDatetime",
  "endDatetime",
  "checkinDatetime",
  "graduationDatetime",
  "mentorName",
  "instructorNames",
  "location",
  "roomName",
  "audience",
  "summary",
  "status",
  "requestSource",
  "maxStudents",
  "materialLink",
  "notes",
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];
const EDITABLE_FIELD_SET = new Set<string>(EDITABLE_FIELDS);

/**
 * 「會被 TIS sync 蓋寫」的欄位 subset；只有這些 key 會被 mark 進 manualOverrides。
 * （與 src/lib/tis/sync-applier.ts 的 TIS_SYNC_PROTECTABLE_FIELDS 對齊）
 */
const PROTECTABLE_FIELDS = new Set<string>([
  "className",
  "campus",
  "category",
  "difficultyLevel",
  "deliveryMode",
  "startDatetime",
  "mentorName",
  "status",
]);

/** datetime-local 字串或 ISO 字串轉 Date；空字串 / null → null */
function parseDateField(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined; // 沒傳就不動
  if (v === null || v === "") return null;
  if (typeof v !== "string") return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const DATE_FIELDS = new Set(["startDatetime", "endDatetime", "checkinDatetime", "graduationDatetime"]);

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }
  const { id } = await params;

  const cls = await prisma.trainingClass.findUnique({
    where: { id },
    select: {
      id: true,
      trainerUserId: true,
      manualOverrides: true,
      tisOriginalValues: true,
    },
  });
  if (!cls) {
    return NextResponse.json({ error: "找不到班次" }, { status: 404 });
  }

  const role = (session.user as { role?: string }).role;
  const userId = (session.user as { id?: string }).id;
  if (role !== "admin" && cls.trainerUserId !== userId) {
    return NextResponse.json({ error: "無權編輯此班次" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "payload 非合法 JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "payload 必須為物件" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;

  // 處理 restore 模式：把指定欄位還原為 tisOriginalValues 的值，並從 manualOverrides 移除
  const updateData: Record<string, unknown> = {};
  const currentOverrides =
    cls.manualOverrides && typeof cls.manualOverrides === "object" && !Array.isArray(cls.manualOverrides)
      ? { ...(cls.manualOverrides as Record<string, unknown>) }
      : {};

  if (Array.isArray(o.restore)) {
    const tisOrig =
      cls.tisOriginalValues && typeof cls.tisOriginalValues === "object" && !Array.isArray(cls.tisOriginalValues)
        ? (cls.tisOriginalValues as Record<string, unknown>)
        : {};
    for (const k of o.restore) {
      if (typeof k !== "string" || !PROTECTABLE_FIELDS.has(k)) continue;
      const orig = tisOrig[k];
      // Date 欄位要從 ISO 字串還原回 Date；其他類型直接帶入
      if (DATE_FIELDS.has(k)) {
        updateData[k] = typeof orig === "string" ? new Date(orig) : null;
      } else {
        updateData[k] = orig === undefined ? null : orig;
      }
      delete currentOverrides[k];
    }
  }

  // 處理一般欄位編輯
  const overrideAdditions: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (k === "restore") continue;
    if (!EDITABLE_FIELD_SET.has(k)) continue;
    let value: unknown = v;
    if (DATE_FIELDS.has(k)) {
      const parsed = parseDateField(v);
      if (parsed === undefined) continue;
      value = parsed;
    } else if (k === "maxStudents") {
      if (v === null || v === "") value = null;
      else if (typeof v === "number") value = Math.max(0, Math.floor(v));
      else if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) value = Math.max(0, Math.floor(Number(v)));
      else continue;
    } else if (typeof v === "string") {
      value = v;
    } else if (v === null) {
      value = null;
    } else {
      continue;
    }
    updateData[k] = value;
    if (PROTECTABLE_FIELDS.has(k)) {
      currentOverrides[k] = true;
      overrideAdditions.push(k);
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "沒有可更新的欄位" }, { status: 400 });
  }

  updateData.manualOverrides = currentOverrides as Prisma.InputJsonValue;

  const updated = await prisma.trainingClass.update({
    where: { id },
    data: updateData as Prisma.TrainingClassUncheckedUpdateInput,
    include: { trainer: { select: { name: true, department: true, email: true } } },
  });

  return NextResponse.json({
    ok: true,
    class: updated,
    overrideAdded: overrideAdditions,
    restored: Array.isArray(o.restore) ? o.restore.filter((k) => typeof k === "string" && PROTECTABLE_FIELDS.has(k)) : [],
  });
}
