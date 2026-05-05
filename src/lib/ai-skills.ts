/**
 * 【AI 技能脈絡】
 * 從資料庫組出「全院共用 + 個人」文字區塊，供全系統生成式 AI Prompt 動態插入。
 * 維運說明與擴充清單：docs/AI_SKILLS_CONTEXT.md
 */
import "server-only";
import { prisma } from "@/lib/prisma";

const PROMPT_PREAMBLE = `---
【系統注入：學院與個人 AI 技能脈絡】
以下由培訓師瑞士刀資料庫提供，描述機構共通做法與目前登入者的偏好與重點。請在回答中適度對齊，並遵守：不捏造未經證實的具體人事、日期、系統狀態；內部組織或資訊系統描述僅作語境，若與使用者當次輸入衝突，以當次輸入為準。
---`;

/** 課程規劃相關 API 僅注入這些全院技能（另含 slug 以 `planning_` 開頭者），避免 EDM 等無關內容佔滿 token。 */
export const PLANNING_INCLUDED_GLOBAL_SLUGS = ["course_planning", "instructor_search", "classroom", "schedule"] as const;
export const PLANNING_INCLUDED_SLUG_PREFIXES = ["planning_"] as const;

export type BuildAiSkillPromptAppendOptions = {
  /** 僅納入列於此的 slug（若同時設 prefix，則符合任一即納入） */
  includeSlugs?: string[];
  /** 納入 slug 以此前綴開頭者（例如 planning_） */
  includeSlugPrefixes?: string[];
};

function shouldIncludeGlobalSkill(
  slug: string,
  opts?: BuildAiSkillPromptAppendOptions
): boolean {
  if (!opts?.includeSlugs?.length && !opts?.includeSlugPrefixes?.length) return true;
  if (opts.includeSlugs?.includes(slug)) return true;
  if (opts.includeSlugPrefixes?.some((p) => slug.startsWith(p))) return true;
  return false;
}

// ============================================================
// In-memory cache（P1）：course-planner 每跑一次 pipeline 會呼 11 次 loadSkillContext，
// DB 內容多半 5 分鐘內不會變。用 (userId, options-key) 當 key，TTL 5 分鐘。
// ============================================================
type CacheEntry = { value: string; expiresAt: number };
const skillContextCache = new Map<string, CacheEntry>();
const SKILL_CONTEXT_TTL_MS = Number(process.env.AI_SKILL_CONTEXT_CACHE_TTL_MS ?? 5 * 60 * 1000);

function buildContextCacheKey(userId: string, options?: BuildAiSkillPromptAppendOptions): string {
  const slugs = (options?.includeSlugs ?? []).slice().sort().join(",");
  const prefixes = (options?.includeSlugPrefixes ?? []).slice().sort().join(",");
  return `${userId}|s=${slugs}|p=${prefixes}`;
}

/** 帶 TTL in-memory cache 的 buildAiSkillPromptAppend；底層仍走 DB（cache miss 時）。 */
export async function loadCachedSkillContext(
  userId: string,
  options?: BuildAiSkillPromptAppendOptions,
): Promise<string> {
  if (SKILL_CONTEXT_TTL_MS <= 0) {
    return buildAiSkillPromptAppend(userId, options);
  }
  const key = buildContextCacheKey(userId, options);
  const now = Date.now();
  const hit = skillContextCache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }
  const value = await buildAiSkillPromptAppend(userId, options);
  skillContextCache.set(key, { value, expiresAt: now + SKILL_CONTEXT_TTL_MS });
  // 簡易上限：避免長期累積（多帳號／多選項）
  if (skillContextCache.size > 256) {
    const oldestKey = skillContextCache.keys().next().value;
    if (oldestKey) skillContextCache.delete(oldestKey);
  }
  return value;
}

/** 在管理員修改 AI 技能定義 / 個人脈絡後呼叫，可立即清掉舊快取。 */
export function invalidateSkillContextCache(userId?: string): void {
  if (!userId) {
    skillContextCache.clear();
    return;
  }
  for (const k of skillContextCache.keys()) {
    if (k.startsWith(`${userId}|`)) skillContextCache.delete(k);
  }
}

/** 併入各 AI 呼叫的 user 訊息尾端（或獨立 system 區塊前） */
export async function buildAiSkillPromptAppend(
  forUserId: string,
  options?: BuildAiSkillPromptAppendOptions
): Promise<string> {
  const globals = await prisma.aiGlobalSkillDefinition.findMany({
    orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
    include: {
      versions: { orderBy: { versionNo: "desc" }, take: 1 },
    },
  });

  const globalParts: string[] = [];
  for (const g of globals) {
    if (!shouldIncludeGlobalSkill(g.slug, options)) continue;
    const v = g.versions[0];
    const body = v?.content?.trim() ?? "";
    if (!body) continue;
    globalParts.push(`### ${g.title}（\`${g.slug}\`）\n${body}`);
  }

  const personalDef = await prisma.aiTrainerSkillDefinition.findUnique({
    where: { userId: forUserId },
    include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } },
  });
  const personalBody = personalDef?.versions[0]?.content?.trim() ?? "";

  if (globalParts.length === 0 && !personalBody) {
    return "";
  }

  const chunks = [PROMPT_PREAMBLE, "", "## 全院共用（系統管理員維護）"];
  if (globalParts.length === 0) {
    chunks.push("（尚未填寫任何全院技能內容。）");
  } else {
    chunks.push(globalParts.join("\n\n"));
  }
  chunks.push("", "## 個人培訓師脈絡（目前登入帳號）");
  chunks.push(personalBody || "（尚未填寫個人脈絡。）");

  return `\n${chunks.join("\n")}\n`;
}

export async function nextGlobalSkillVersionNo(definitionId: string): Promise<number> {
  const agg = await prisma.aiGlobalSkillVersion.aggregate({
    where: { definitionId },
    _max: { versionNo: true },
  });
  return (agg._max.versionNo ?? 0) + 1;
}

export async function nextTrainerSkillVersionNo(definitionId: string): Promise<number> {
  const agg = await prisma.aiTrainerSkillVersion.aggregate({
    where: { definitionId },
    _max: { versionNo: true },
  });
  return (agg._max.versionNo ?? 0) + 1;
}

const SLUG_RE = /^[a-z][a-z0-9_]{0,63}$/;

export function assertValidSkillSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      "內部代號（slug，網址／程式用短名）須為小寫英文與數字、底線，且以英文字母開頭，長度 1～64"
    );
  }
}

/** 取得或建立個人定義（不含預設版本時不回傳版本，由前端提示先儲存） */
export async function ensureTrainerSkillDefinition(userId: string) {
  return prisma.aiTrainerSkillDefinition.upsert({
    where: { userId },
    create: { userId, title: "個人培訓師 AI 脈絡" },
    update: {},
  });
}
