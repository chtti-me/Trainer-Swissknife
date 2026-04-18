/**
 * 【EDM：貼上文字／HTML 解析】
 * 從使用者貼上的雜亂文字裡，用規則運算式抓出班名、時數、講師等欄位。
 * 比喻：從一張便條紙上「圈重點」抄到表單。
 */
import { ParsedClassInfo, ParsedFieldOption } from "@/lib/edm/types";

function cleanText(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const matched = text.match(pattern);
    if (matched?.[1]) return matched[1].trim();
  }
  return undefined;
}

function toIsoDate(rocText?: string): string | undefined {
  if (!rocText) return undefined;
  const matched = rocText.match(/(\d{2,3})年(\d{1,2})月(\d{1,2})日/);
  if (!matched) return undefined;
  const year = Number(matched[1]) + 1911;
  const month = matched[2].padStart(2, "0");
  const day = matched[3].padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function numberFromText(value?: string): number | undefined {
  if (!value) return undefined;
  const matched = value.match(/(\d+(?:\.\d+)?)/);
  if (!matched) return undefined;
  return Number(matched[1]);
}

function extractCourseItems(text: string): ParsedClassInfo["courseItems"] {
  const rows = text.match(/([A-Z]{1,4}\d{2,5}[A-Z]?)\s+([^\n\r]+?)\s+(\d+(?:\.\d+)?)\s+([^\n\r]{1,25})/g) || [];
  return rows.slice(0, 10).map((row) => {
    const matched = row.match(/([A-Z]{1,4}\d{2,5}[A-Z]?)\s+(.+?)\s+(\d+(?:\.\d+)?)\s+([^\n\r]{1,25})/);
    return {
      code: matched?.[1]?.trim() || "",
      name: matched?.[2]?.trim() || "",
      lectureHours: numberFromText(matched?.[3]),
      instructor: matched?.[4]?.trim() || "",
    };
  }).filter((item) => item.code && item.name);
}

function buildRegistrationUrl(classId?: string): string | undefined {
  if (!classId) return undefined;
  return `https://tis.cht.com.tw/jap/OpenClass/OpenClass_planformQa.jsp?classid=${encodeURIComponent(classId)}`;
}

export function parseClassInfoFromText(raw: string): ParsedClassInfo {
  const text = cleanText(raw);

  const classId = firstMatch(text, [
    /班代號\s*([A-Z]{1,4}\d{2,5}[A-Z]?)/i,
    /classid=([A-Z0-9]+)/i,
  ]);
  const className = firstMatch(text, [
    /主題\s*【?([^【\n]+?)\s*(?:\(|期數|體系別)/,
    /課程名稱\s*([^。\n]{4,80})/,
  ]);
  const periodCodeRaw = firstMatch(text, [/(\([A-Z0-9]{6,12}\))/]);
  const periodCode = periodCodeRaw ? periodCodeRaw.replace(/[()]/g, "") : undefined;
  const system = firstMatch(text, [/體系別\s*([\u4e00-\u9fa5A-Za-z]+)/]);
  const days = numberFromText(firstMatch(text, [/天數\s*([\d.]+)/]));
  const hours = numberFromText(firstMatch(text, [/已排\s*([\d.]+)\s*小時/]));
  const trainerName = firstMatch(text, [/導師1?\s*([\u4e00-\u9fa5]{2,10})/]);
  const trainerPhone = firstMatch(text, [/電話\s*([0-9\-]{7,20})/]);
  const trainerEmail = firstMatch(text, [/E-?Mail\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i]);
  const goal = firstMatch(text, [/目標\s*([\s\S]{8,120}?)\s*對象/]);
  const audience = firstMatch(text, [/對象\s*([\s\S]{8,120}?)\s*預備知識/]);
  const prerequisites = firstMatch(text, [/預備知識\s*([\s\S]{8,140}?)\s*期間/]);
  const periodText = firstMatch(text, [/期間\s*(\d{2,3}年\d{1,2}月\d{1,2}日)\s*至\s*(\d{2,3}年\d{1,2}月\d{1,2}日)/]);
  const periodRange = text.match(/期間\s*(\d{2,3}年\d{1,2}月\d{1,2}日)\s*至\s*(\d{2,3}年\d{1,2}月\d{1,2}日)/);
  const startDate = periodRange ? toIsoDate(periodRange[1]) : toIsoDate(periodText);
  const endDate = periodRange ? toIsoDate(periodRange[2]) : undefined;
  const checkinTime = firstMatch(text, [/報到時間\s*([0-9:]{4,5}\s*~\s*[0-9:]{4,5})/]);
  const sessionTimeRange = firstMatch(text, [
    /上課時間\s*([0-9０-９]{1,2}[:：][0-9０-９]{2}\s*[~～－\-至到]\s*[0-9０-９]{1,2}[:：][0-9０-９]{2})/,
    /授課時間\s*([^\n\r]{4,40})/,
    /每日\s*([0-9０-９]{1,2}[:：][0-9０-９]{2}\s*[~～－\-]\s*[0-9０-９]{1,2}[:：][0-9０-９]{2})/,
    /時段\s*([0-9０-９]{1,2}[:：][0-9０-９]{2}\s*[~～－\-]\s*[0-9０-９]{1,2}[:：][0-9０-９]{2})/,
  ]);
  const location = firstMatch(text, [/報到地點\s*([\s\S]{3,90}?)\s*開班性質/]);
  const classroom = firstMatch(text, [/教室[：:]\s*([\s\S]{2,80}?)\s*課程資料/]);
  const estimatedTraineeCount = numberFromText(firstMatch(text, [/合計\s*(\d{1,5})/]));
  const registrationRaw = firstMatch(raw, [/OpenClass_planformQa\.jsp\?[^"' ]+/]);
  const registrationUrl = registrationRaw
    ? registrationRaw.replace(/&amp;/g, "&")
    : buildRegistrationUrl(classId);
  const courseItems = extractCourseItems(raw);

  return {
    classId,
    className,
    periodCode,
    system,
    days,
    hours,
    trainerName,
    trainerPhone,
    trainerEmail,
    goal,
    audience,
    prerequisites,
    startDate,
    endDate,
    sessionTimeRange,
    checkinTime,
    location,
    classroom,
    registrationUrl,
    estimatedTraineeCount,
    courseItems,
    rawText: text,
  };
}

export function parseClassInfoFromHtml(html: string): ParsedClassInfo {
  return parseClassInfoFromText(html);
}

export function buildFieldOptions(parsed: ParsedClassInfo): ParsedFieldOption[] {
  return [
    { key: "className", label: "班名", checked: Boolean(parsed.className), value: parsed.className },
    { key: "classId", label: "班代號", checked: Boolean(parsed.classId), value: parsed.classId },
    { key: "startDate", label: "開班日期", checked: Boolean(parsed.startDate), value: parsed.startDate },
    { key: "registrationUrl", label: "報名網址", checked: Boolean(parsed.registrationUrl), value: parsed.registrationUrl },
    { key: "trainer", label: "導師", checked: Boolean(parsed.trainerName), value: parsed.trainerName },
    { key: "hours", label: "時數", checked: Boolean(parsed.hours), value: parsed.hours ? `${parsed.hours}` : undefined },
    { key: "location", label: "上課地點", checked: Boolean(parsed.location), value: parsed.location },
    { key: "goal", label: "課程目標", checked: Boolean(parsed.goal), value: parsed.goal },
    { key: "audience", label: "對象", checked: Boolean(parsed.audience), value: parsed.audience },
    { key: "prerequisites", label: "預備知識", checked: Boolean(parsed.prerequisites), value: parsed.prerequisites },
    { key: "courseItems", label: "課程清單", checked: parsed.courseItems.length > 0, value: parsed.courseItems.length ? `${parsed.courseItems.length} 筆` : undefined },
    { key: "estimatedTraineeCount", label: "預調人數", checked: Boolean(parsed.estimatedTraineeCount), value: parsed.estimatedTraineeCount ? `${parsed.estimatedTraineeCount}` : undefined },
  ];
}
