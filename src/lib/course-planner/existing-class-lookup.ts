/**
 * 課程規劃幫手 — 既有班相似度搜尋（前置步驟）
 *
 * 在跑 11 Skills 之前，先用培訓師貼上的需求文字去比對瑞士刀資料庫內的所有 TrainingClass。
 * 若 Top1 ≥ 0.85，會建議「考慮沿用既有班，不一定要設計新班」。
 * 若在 0.65 ~ 0.85，照常跑 pipeline，但相似班名會給 outline Skill 當命名靈感。
 * < 0.65 完全當新班處理。
 *
 * 包裝 src/lib/similarity.ts 的 computeSimilarityV4 + src/lib/embedding.ts 的 generateEmbedding。
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { generateEmbedding } from "@/lib/embedding";
import {
  computeSimilarityV4,
  type SimilarityQuery,
  type SimilarityResult,
  type SimilarityTarget,
} from "@/lib/similarity";

export const REUSE_THRESHOLD = 0.85;
export const REFERENCE_THRESHOLD = 0.65;

export interface ExistingClassLookupResult {
  query: string;
  totalCompared: number;
  /** 命中的既有班（依 totalScore 由高到低） */
  matches: SimilarityResult[];
  /** Top1 相似度（無命中為 0） */
  topScore: number;
  /** 是否到「強烈建議沿用」的程度（≥ REUSE_THRESHOLD） */
  reuseRecommended: boolean;
  /** 是否有「中度相似可參考」（≥ REFERENCE_THRESHOLD） */
  hasReferences: boolean;
}

// ============================================================
// In-memory LRU cache（P1）：相同需求文字 1 小時內命中即省一次 embedding API 呼叫 + 全表 similarity 計算。
// 多 process 部署時各自為政；Next dev / 單機 prod 場景已足夠。
// ============================================================
const LOOKUP_CACHE_TTL_MS = Number(process.env.COURSE_PLANNER_LOOKUP_CACHE_TTL_MS ?? 60 * 60 * 1000);
const LOOKUP_CACHE_MAX = 64;
const lookupCache = new Map<string, { value: ExistingClassLookupResult; expiresAt: number }>();

function lookupCacheKey(text: string, topK: number): string {
  return `k=${topK}|${text}`;
}

/**
 * 用培訓師的原始需求文字去找瑞士刀 DB 內的相似既有班。
 *
 * 與 /api/similarity/check 不同的是：
 *   - 沒有日期 / 院區篩選（盡量找全部）
 *   - 不寫 SimilarityCheck 表（這只是內部前置查詢）
 *   - 用較低的內部 threshold（0.5）拿 Top 5
 */
export async function findSimilarExistingClasses(
  rawInputText: string,
  options?: { topK?: number; bypassCache?: boolean },
): Promise<ExistingClassLookupResult> {
  const topK = options?.topK ?? 5;
  const cleaned = rawInputText.replace(/\s+/g, " ").trim();
  if (cleaned.length < 5) {
    return {
      query: cleaned,
      totalCompared: 0,
      matches: [],
      topScore: 0,
      reuseRecommended: false,
      hasReferences: false,
    };
  }

  // Cache lookup
  const cacheKey = lookupCacheKey(cleaned, topK);
  if (!options?.bypassCache && LOOKUP_CACHE_TTL_MS > 0) {
    const hit = lookupCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      // touch（簡易 LRU：刪後再加一次擺到尾端）
      lookupCache.delete(cacheKey);
      lookupCache.set(cacheKey, hit);
      return hit.value;
    }
  }

  const classes = await prisma.trainingClass.findMany({
    take: 2000,
    include: { trainer: { select: { name: true } } },
  });

  if (classes.length === 0) {
    return {
      query: cleaned,
      totalCompared: 0,
      matches: [],
      topScore: 0,
      reuseRecommended: false,
      hasReferences: false,
    };
  }

  const idList = classes.map((c) => c.id);
  const vectorScoreMap = new Map<string, number>();

  try {
    const queryVec = await generateEmbedding(cleaned.slice(0, 4000));
    if (queryVec.length > 0) {
      const vecLiteral = `[${queryVec.join(",")}]`;
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string; score: number }>>(
        `SELECT id, (1 - (embedding <=> $1::vector))::float AS score
         FROM training_classes
         WHERE embedding IS NOT NULL AND id = ANY($2::text[])`,
        vecLiteral,
        idList,
      );
      for (const r of rows) vectorScoreMap.set(r.id, Number(r.score));
    }
  } catch (e) {
    console.warn("[course-planner existing-class-lookup] 向量引擎失敗，改用純文字：", (e as Error).message);
  }

  const targets: SimilarityTarget[] = classes.map((c) => ({
    id: c.id,
    className: c.className,
    classCode: c.classCode,
    summary: c.summary,
    difficultyLevel: c.difficultyLevel,
    audience: c.audience,
    campus: c.campus,
    category: c.category,
    deliveryMode: c.deliveryMode,
    startDatetime: c.startDatetime,
    trainerName: c.trainer?.name || null,
    mentorName: c.mentorName,
    instructorNames: c.instructorNames,
    vectorScore: vectorScoreMap.has(c.id) ? vectorScoreMap.get(c.id)! : null,
  }));

  // 用 needs / outline 慣用的字段組裝 query：把全部塞進 className + summary
  const similarityQuery: SimilarityQuery = {
    className: cleaned.slice(0, 200),
    summary: cleaned,
  };

  // 用較低的 threshold 拿到「中度相似」的也回傳給 LLM 當參考
  const lexicalWeight = Number(process.env.SIMILARITY_LEXICAL_WEIGHT) || 0.4;
  const vectorWeight = Number(process.env.SIMILARITY_VECTOR_WEIGHT) || 0.6;
  const allMatches = computeSimilarityV4(similarityQuery, targets, 0.5, lexicalWeight, vectorWeight);
  const matches = allMatches.slice(0, topK);
  const topScore = matches[0]?.totalScore ?? 0;

  const result: ExistingClassLookupResult = {
    query: cleaned,
    totalCompared: targets.length,
    matches,
    topScore,
    reuseRecommended: topScore >= REUSE_THRESHOLD,
    hasReferences: topScore >= REFERENCE_THRESHOLD,
  };

  if (LOOKUP_CACHE_TTL_MS > 0) {
    lookupCache.set(cacheKey, { value: result, expiresAt: Date.now() + LOOKUP_CACHE_TTL_MS });
    if (lookupCache.size > LOOKUP_CACHE_MAX) {
      const oldest = lookupCache.keys().next().value;
      if (oldest) lookupCache.delete(oldest);
    }
  }
  return result;
}

/** 對外公開：在新增／修改既有班後可呼叫，避免培訓師看到舊快取結果。 */
export function invalidateExistingClassLookupCache(): void {
  lookupCache.clear();
}
