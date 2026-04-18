/**
 * Agent 工具：語義搜尋 v4.0（pgvector 版）
 * 利用 pgvector 在資料庫端直接以 ANN（Approximate Nearest Neighbor）找相似班次，
 * 不再逐筆呼叫 Embedding API，速度與成本大幅改善。
 *
 * 比喻：從「把 500 本書一本一本翻」變成「圖書館有 Dewey 索引，直接跳到相關書架」。
 *
 * 需求：TrainingClass.embedding 已透過 `npm run embed:backfill` 填入。
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { generateEmbedding } from "@/lib/embedding";
import type { AgentToolExecutor, AgentToolResult } from "../types";

const definition = {
  name: "semantic_search",
  description:
    "以語義（意思）搜尋班次資料。可用自然語言描述想找的課程，系統會使用 AI 向量嵌入 + pgvector 語意索引找出最相關的班次，不限於字面相符。例如：「跟雲端運算有關的培訓課程」、「資安攻防相關」。適合在 db_query 找不到滿意結果時使用。",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "用自然語言描述想要搜尋的課程內容、主題或特徵",
      },
      topK: {
        type: "number",
        description: "回傳幾筆最相關的結果（預設 8，最多 20）",
      },
      campus: {
        type: "string",
        description: "限定院區（選填）：院本部 | 台中所 | 高雄所",
      },
    },
    required: ["query"],
  },
} as const;

interface VectorSearchRow {
  id: string;
  class_name: string;
  class_code: string | null;
  summary: string | null;
  campus: string | null;
  category: string | null;
  status: string;
  delivery_mode: string | null;
  start_datetime: Date | null;
  mentor_name: string | null;
  instructor_names: string | null;
  trainer_name: string | null;
  score: number;
}

async function execute(params: Record<string, unknown>): Promise<AgentToolResult> {
  try {
    const query = String(params.query || "").trim();
    if (!query) return { success: false, error: "搜尋關鍵描述不可為空" };

    const topK = Math.min(Math.max(Number(params.topK) || 8, 1), 20);
    const campus = params.campus ? String(params.campus) : undefined;

    const queryEmbedding = await generateEmbedding(query);
    if (queryEmbedding.length === 0) {
      return { success: false, error: "無法產生向量嵌入，請確認 AI API Key 設定" };
    }

    const vecLiteral = `[${queryEmbedding.join(",")}]`;

    // 用 pgvector <=> (cosine distance) 直接排序 + 限制 top K
    // 排除沒有嵌入的資料
    const rows = await prisma.$queryRawUnsafe<VectorSearchRow[]>(
      `SELECT
         tc.id,
         tc.class_name,
         tc.class_code,
         tc.summary,
         tc.campus,
         tc.category,
         tc.status,
         tc.delivery_mode,
         tc.start_datetime,
         tc.mentor_name,
         tc.instructor_names,
         u.name AS trainer_name,
         (1 - (tc.embedding <=> $1::vector))::float AS score
       FROM training_classes tc
       LEFT JOIN users u ON u.id = tc.trainer_user_id
       WHERE tc.embedding IS NOT NULL
         ${campus ? "AND tc.campus = $3" : ""}
       ORDER BY tc.embedding <=> $1::vector
       LIMIT $2`,
      vecLiteral,
      topK,
      ...(campus ? [campus] : [])
    );

    const results = rows
      .filter((r) => r.score >= 0.25)
      .map((r) => ({
        className: r.class_name,
        classCode: r.class_code,
        summary: r.summary?.slice(0, 200) ?? null,
        campus: r.campus,
        category: r.category,
        status: r.status,
        deliveryMode: r.delivery_mode,
        startDate: r.start_datetime
          ? new Date(r.start_datetime).toISOString().split("T")[0]
          : null,
        mentor: r.mentor_name ?? r.trainer_name ?? null,
        instructors: r.instructor_names,
        similarityScore: Math.round(Number(r.score) * 100) / 100,
      }));

    // 統計訊息：若為空可能是因為 embedding 尚未 backfill
    const counts = await prisma.$queryRawUnsafe<Array<{ total: bigint; withvec: bigint }>>(
      `SELECT COUNT(*)::bigint AS total, COUNT(embedding)::bigint AS withvec FROM training_classes`
    );
    const total = counts[0] ? Number(counts[0].total) : 0;
    const withvec = counts[0] ? Number(counts[0].withvec) : 0;

    return {
      success: true,
      data: {
        query,
        engine: "pgvector-hnsw",
        totalClasses: total,
        classesWithEmbedding: withvec,
        matchCount: results.length,
        results,
        ...(withvec === 0
          ? { notice: "資料庫尚未填入向量嵌入，請執行 `npm run embed:backfill` 後再試。" }
          : {}),
      },
    };
  } catch (e) {
    return { success: false, error: `語義搜尋失敗：${(e as Error).message}` };
  }
}

export const semanticSearchTool: AgentToolExecutor = { definition, execute };
