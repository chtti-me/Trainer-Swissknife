/**
 * 【相似度計算引擎 v4.0】
 * 用途：比對「我想開的課」和資料庫裡已有班次有多像，幫你找可能重複或可借鏡的班。
 * 比喻：像比對兩份菜單——「用字」與「意思」都要看：
 *   - 字詞引擎（Jaccard + bigram）：數共同詞，抓到字面近似
 *   - 向量引擎（pgvector cosine）：AI 嵌入比對「意思」近似，抓到同義／近義
 * v4 變更：從純文字演算法升級為「雙引擎加權融合」——兩者分數相加（預設文字 0.4、向量 0.6）。
 */

export interface SimilarityQuery {
  className: string;
  summary: string;
  difficultyLevel?: string;
  audience?: string;
  campus?: string;
  category?: string;
  deliveryMode?: string;
  keywords?: string;
}

export interface SimilarityTarget {
  id: string;
  className: string;
  classCode: string | null;
  summary: string | null;
  difficultyLevel: string | null;
  audience: string | null;
  campus: string | null;
  category: string | null;
  deliveryMode: string | null;
  startDatetime: Date | null;
  trainerName: string | null;
  /** TIS 導師／培訓師快照 */
  mentorName: string | null;
  instructorNames: string | null;
  /** v4：向量引擎算出的餘弦相似度（0～1），未含向量則為 null */
  vectorScore?: number | null;
}

export interface SimilarityResult {
  classId: string;
  className: string;
  classCode: string | null;
  startDate: string | null;
  campus: string | null;
  category: string | null;
  trainerName: string | null;
  mentorName: string | null;
  instructorNames: string | null;
  totalScore: number;
  /** 班名／摘要等文字重疊（Jaccard + bigram） */
  lexicalScore: number;
  /** v4：向量嵌入語意相似度（cosine，0～1） */
  vectorScore: number;
  ruleScore: number;
  reason: string;
  suggestedAction: string;
}

function tokenize(text: string): Set<string> {
  if (!text) return new Set();
  const cleaned = text.toLowerCase().replace(/[，、。；：！？\s]+/g, " ");
  const tokens = new Set<string>();

  const words = cleaned.split(" ").filter((w) => w.length > 0);
  words.forEach((w) => tokens.add(w));

  for (let i = 0; i < cleaned.length - 1; i++) {
    const bigram = cleaned.substring(i, i + 2).trim();
    if (bigram.length === 2) tokens.add(bigram);
  }
  return tokens;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

function computeLexicalOverlapScore(query: SimilarityQuery, target: SimilarityTarget): number {
  const queryText = [query.className, query.summary, query.audience, query.keywords].filter(Boolean).join(" ");
  const targetText = [target.className, target.summary, target.audience].filter(Boolean).join(" ");

  const queryTokens = tokenize(queryText);
  const targetTokens = tokenize(targetText);

  return jaccardSimilarity(queryTokens, targetTokens);
}

function computeRuleScore(query: SimilarityQuery, target: SimilarityTarget): number {
  let score = 0;
  let weights = 0;

  if (query.difficultyLevel && target.difficultyLevel) {
    weights += 0.2;
    if (query.difficultyLevel === target.difficultyLevel) score += 0.2;
  }
  if (query.audience && target.audience) {
    weights += 0.25;
    const queryAudience = tokenize(query.audience);
    const targetAudience = tokenize(target.audience);
    score += 0.25 * jaccardSimilarity(queryAudience, targetAudience);
  }
  if (query.campus && target.campus) {
    weights += 0.15;
    if (query.campus === target.campus) score += 0.15;
  }
  if (query.category && target.category) {
    weights += 0.25;
    if (query.category === target.category) score += 0.25;
  }
  if (query.deliveryMode && target.deliveryMode) {
    weights += 0.15;
    if (query.deliveryMode === target.deliveryMode) score += 0.15;
  }
  return weights > 0 ? score / weights : 0;
}

function getSuggestedAction(score: number): string {
  if (score >= 0.9) return "風險高";
  if (score >= 0.8) return "建議合併";
  if (score >= 0.7) return "建議改版";
  return "可參考";
}

function generateReason(
  query: SimilarityQuery,
  target: SimilarityTarget,
  lexicalScore: number,
  vectorScore: number
): string {
  const reasons: string[] = [];

  if (vectorScore > 0.85) {
    reasons.push("AI 判定語意幾乎相同");
  } else if (vectorScore > 0.7) {
    reasons.push("AI 判定語意高度相關");
  } else if (vectorScore > 0.5) {
    reasons.push("AI 判定語意部分相關");
  }

  if (lexicalScore > 0.5) {
    reasons.push("班名與課程敘述字詞高度重疊");
  } else if (lexicalScore > 0.3) {
    reasons.push("班名或課程敘述有部分字詞重疊");
  }

  if (query.category && query.category === target.category) {
    reasons.push(`同屬「${query.category}」類別`);
  }
  if (query.difficultyLevel && query.difficultyLevel === target.difficultyLevel) {
    reasons.push(`同為「${query.difficultyLevel}」難度`);
  }
  if (query.campus && query.campus === target.campus) {
    reasons.push(`同在「${query.campus}」開班`);
  }
  if (query.deliveryMode && query.deliveryMode === target.deliveryMode) {
    reasons.push(`同為「${query.deliveryMode}」方式`);
  }

  return reasons.length > 0 ? reasons.join("；") : "部分欄位有相似性";
}

/**
 * 【v4 雙引擎相似度】文字 + 向量 + 規則三者加權合併
 *
 * totalScore = lexicalScore * lexicalWeight + vectorScore * vectorWeight + ruleScore * ruleWeight
 * 其中 lexicalWeight + vectorWeight = 1 - ruleWeight（預設 lexical=0.4, vector=0.6, rule=0.4 獨立加權）
 *
 * 實際公式採「內容相似度」(lex+vec 合計 1) * 0.6 + ruleScore * 0.4，
 * 以免內容相似但條件不符也被列入。
 */
export function computeSimilarityV4(
  query: SimilarityQuery,
  targets: SimilarityTarget[],
  threshold: number = 0.75,
  lexicalWeight: number = 0.4,
  vectorWeight: number = 0.6
): SimilarityResult[] {
  const contentWeightSum = lexicalWeight + vectorWeight;
  const lw = contentWeightSum > 0 ? lexicalWeight / contentWeightSum : 0.4;
  const vw = contentWeightSum > 0 ? vectorWeight / contentWeightSum : 0.6;

  const results: SimilarityResult[] = [];

  for (const target of targets) {
    const lexicalScore = computeLexicalOverlapScore(query, target);
    const vectorScore = typeof target.vectorScore === "number" ? Math.max(0, Math.min(1, target.vectorScore)) : 0;
    const ruleScore = computeRuleScore(query, target);

    // 若無向量資料，回退為純文字（權重全押 lexical）
    const hasVector = target.vectorScore != null;
    const contentScore = hasVector ? lexicalScore * lw + vectorScore * vw : lexicalScore;

    const totalScore = contentScore * 0.6 + ruleScore * 0.4;

    if (totalScore >= threshold) {
      results.push({
        classId: target.id,
        className: target.className,
        classCode: target.classCode,
        startDate: target.startDatetime ? new Date(target.startDatetime).toISOString().split("T")[0] : null,
        campus: target.campus,
        category: target.category,
        trainerName: target.trainerName,
        mentorName: target.mentorName,
        instructorNames: target.instructorNames,
        totalScore: Math.round(totalScore * 100) / 100,
        lexicalScore: Math.round(lexicalScore * 100) / 100,
        vectorScore: Math.round(vectorScore * 100) / 100,
        ruleScore: Math.round(ruleScore * 100) / 100,
        reason: generateReason(query, target, lexicalScore, vectorScore),
        suggestedAction: getSuggestedAction(totalScore),
      });
    }
  }

  results.sort((a, b) => b.totalScore - a.totalScore);
  return results;
}

/**
 * 【Deprecated 相容別名】
 * 保留舊名以免呼叫方全面改寫；新程式請改用 computeSimilarityV4。
 */
export function computeSimilarity(
  query: SimilarityQuery,
  targets: SimilarityTarget[],
  threshold: number = 0.75,
  lexicalWeight: number = 0.4,
  vectorWeight: number = 0.6
): SimilarityResult[] {
  return computeSimilarityV4(query, targets, threshold, lexicalWeight, vectorWeight);
}
