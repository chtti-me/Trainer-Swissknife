/**
 * 【相似度檢測 API v4.0】POST
 *
 * 流程：
 *   1. 依日期／院區／類別等條件篩出候選班次
 *   2. 對查詢文字產生向量，透過 pgvector `<=>` 取得語意相似度（內部排序、挑 top 200）
 *   3. 把候選丟給 computeSimilarityV4：文字 + 向量 + 規則三引擎融合
 *   4. 以 threshold 過濾並儲存 SimilarityCheck
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeSimilarityV4, type SimilarityQuery, type SimilarityTarget } from "@/lib/similarity";
import { generateEmbedding } from "@/lib/embedding";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;
  const body = await req.json();
  const { query, filters } = body as {
    query: SimilarityQuery;
    filters: {
      startDate?: string;
      endDate?: string;
      campuses?: string[];
      categories?: string[];
      deliveryModes?: string[];
      includeOthers?: boolean;
      threshold?: number;
    };
  };

  if (!query?.className) {
    return NextResponse.json({ error: "請提供班名" }, { status: 400 });
  }
  if (!filters?.startDate || !filters?.endDate) {
    return NextResponse.json({ error: "請指定日期區間" }, { status: 400 });
  }

  const where: Record<string, unknown> = {
    startDatetime: {
      gte: new Date(filters.startDate),
      lte: new Date(filters.endDate),
    },
  };
  if (filters.campuses?.length) where.campus = { in: filters.campuses };
  if (filters.categories?.length) where.category = { in: filters.categories };
  if (filters.deliveryModes?.length) where.deliveryMode = { in: filters.deliveryModes };
  if (filters.includeOthers === false) where.trainerUserId = userId;

  const classes = await prisma.trainingClass.findMany({
    where,
    include: { trainer: { select: { name: true } } },
    take: 2000,
  });

  if (classes.length === 0) {
    const check = await prisma.similarityCheck.create({
      data: {
        createdBy: userId,
        queryPayload: JSON.stringify(query),
        filterPayload: JSON.stringify(filters),
        threshold: filters.threshold ?? 0.75,
        resultJson: JSON.stringify([]),
        status: "completed",
      },
    });
    return NextResponse.json({ checkId: check.id, totalCompared: 0, matchCount: 0, results: [] });
  }

  // === v4：產生查詢向量 + pgvector 語意分數 ===
  const idList = classes.map((c) => c.id);
  const vectorScoreMap = new Map<string, number>();
  let engine = "lexical+rule";

  try {
    const queryText = [query.className, query.summary, query.keywords, query.audience]
      .filter(Boolean)
      .join(" ")
      .trim();

    if (queryText) {
      const queryVec = await generateEmbedding(queryText);
      if (queryVec.length > 0) {
        const vecLiteral = `[${queryVec.join(",")}]`;
        // pgvector 的 `<=>` 為 cosine distance（0 代表相同），1 - dist = similarity
        const rows = await prisma.$queryRawUnsafe<Array<{ id: string; score: number }>>(
          `SELECT id, (1 - (embedding <=> $1::vector))::float AS score
           FROM training_classes
           WHERE embedding IS NOT NULL AND id = ANY($2::text[])`,
          vecLiteral,
          idList
        );
        for (const r of rows) vectorScoreMap.set(r.id, Number(r.score));
        if (vectorScoreMap.size > 0) engine = "vector+lexical+rule";
      }
    }
  } catch (e) {
    console.warn("[similarity] 向量引擎失敗，改用純文字：", (e as Error).message);
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

  const similarityQuery: SimilarityQuery = {
    className: query.className,
    summary: query.summary || "",
    difficultyLevel: query.difficultyLevel,
    audience: query.audience,
    campus: query.campus,
    category: query.category,
    deliveryMode: query.deliveryMode,
    keywords: query.keywords,
  };

  const threshold = filters.threshold || 0.75;
  const lexicalWeight = Number(process.env.SIMILARITY_LEXICAL_WEIGHT) || 0.4;
  const vectorWeight = Number(process.env.SIMILARITY_VECTOR_WEIGHT) || 0.6;
  const results = computeSimilarityV4(similarityQuery, targets, threshold, lexicalWeight, vectorWeight);

  const check = await prisma.similarityCheck.create({
    data: {
      createdBy: userId,
      queryPayload: JSON.stringify(query),
      filterPayload: JSON.stringify(filters),
      threshold,
      resultJson: JSON.stringify(results),
      status: "completed",
    },
  });

  return NextResponse.json({
    checkId: check.id,
    totalCompared: targets.length,
    vectorMatched: vectorScoreMap.size,
    matchCount: results.length,
    engine,
    results,
  });
}
