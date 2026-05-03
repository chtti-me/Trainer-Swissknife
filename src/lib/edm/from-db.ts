/**
 * 【EDM Generator：從 DB 帶入 ClassPlan】
 *
 * 把瑞士刀 TrainingClass model 對映成 EDM Generator 的 ClassPlan 結構，
 * 讓使用者從班次清單 / 詳情點「製作 EDM」直接跳轉並帶入既有資料，
 * 跳過 EDM Generator 原本的「貼文字 / OCR / AI 解析」三步驟。
 *
 * 缺漏欄位（總時數、prerequisites、courses 中的 hours）保留空白 / 0，
 * 由使用者在 EDM Generator 編輯器中手動補齊。
 */
import "server-only";
import type { TrainingClass } from "@prisma/client";
import type { ClassPlan } from "@edm/types/classPlan";
import { emptyClassPlan } from "@edm/types/classPlan";

const TW_TZ = "Asia/Taipei";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 取台灣時區下的 YYYY-MM-DD */
function toDateOnly(d: Date | null | undefined): string {
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TW_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const dd = parts.find((p) => p.type === "day")?.value ?? "";
  return y && m && dd ? `${y}-${m}-${dd}` : "";
}

/** 取台灣時區下的 HH:mm */
function toTimeOnly(d: Date | null | undefined): string {
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: TW_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value ?? "";
  const m = parts.find((p) => p.type === "minute")?.value ?? "";
  if (!h || !m) return "";
  // zh-TW Intl 在跨日 / 24 點時偶爾會給出 "24"，正規化回 "00"
  const hh = h === "24" ? "00" : pad2(parseInt(h, 10));
  return `${hh}:${m}`;
}

/** 把以逗號 / 頓號 / 換行 / 分號分隔的字串轉成陣列；過濾空字串 */
function splitToArray(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/[,，、;；\n\r]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 把 summary 切成 objectives 條列；過濾掉純空白 / 過短行 */
function summaryToObjectives(summary: string | null | undefined): string[] {
  if (!summary) return [];
  const raw = summary
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  // 去掉常見的條列符號
  return raw
    .map((line) => line.replace(/^[-•・*◆◇■□●○\d.\s）)、]+/, "").trim())
    .filter((line) => line.length >= 2);
}

/**
 * TrainingClass → ClassPlan 對映
 */
export function toClassPlan(cls: TrainingClass): ClassPlan {
  const base = emptyClassPlan();
  const startDate = toDateOnly(cls.startDatetime);
  const endDate = toDateOnly(cls.endDatetime);
  const startTime = toTimeOnly(cls.startDatetime);
  const endTime = toTimeOnly(cls.endDatetime);
  const audienceList = splitToArray(cls.audience);
  const objectives = summaryToObjectives(cls.summary);
  const instructors = splitToArray(cls.instructorNames);

  // 班代號優先順序：classCode → tisClassId5 + (venue + session) → 空
  const classCode =
    cls.classCode ||
    [cls.tisClassId5, cls.tisVenueCode, cls.tisSessionCode].filter(Boolean).join("") ||
    "";

  // location 優先順序：location > roomName
  const location = cls.location || cls.roomName || "";

  // 講師若有名單但沒有 course 資料，組成「以班名為模組名」的單一 course
  // 讓 EDM Generator 至少能渲染一筆「課程模組」
  const courses =
    instructors.length > 0
      ? [
          {
            code: cls.classCode || "",
            name: cls.className || "",
            hours: 0,
            instructor: instructors.join("、"),
          },
        ]
      : [];

  return {
    ...base,
    classCode,
    title: cls.className || "",
    termNumber: cls.tisSessionCode || "",
    startDate,
    endDate,
    classDays: [],
    startTime,
    endTime,
    totalHours: 0,
    location,
    audience: audienceList,
    prerequisites: "",
    objectives,
    mentor: { name: cls.mentorName || "", phone: "", email: "" },
    courses,
    registrationUrl: "",
    syllabusUrl: cls.materialLink || "",
  };
}
