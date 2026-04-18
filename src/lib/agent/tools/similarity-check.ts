/**
 * Agent 工具：相似度檢測
 * 比對班次與現有資料庫，找出可能重複或類似的班次。
 */
import "server-only";

import type { AgentToolExecutor, AgentToolResult } from "../types";
import { prisma } from "@/lib/prisma";
import { computeSimilarity, type SimilarityQuery, type SimilarityTarget } from "@/lib/similarity";

const definition = {
  name: "similarity_check",
  description:
    "將使用者提供的課程資訊與資料庫中既有班次比對相似度，找出可能重複或可借鏡的班次。回傳相似度分數與建議動作。",
  parameters: {
    type: "object",
    properties: {
      className: {
        type: "string",
        description: "要比對的班名（必填）",
      },
      summary: {
        type: "string",
        description: "課程內容摘要",
      },
      campus: {
        type: "string",
        description: "院所別（院本部、台中所、高雄所）",
      },
      category: {
        type: "string",
        description: "課程類別",
      },
      threshold: {
        type: "number",
        description: "相似度門檻（0-1，預設 0.5）",
      },
    },
    required: ["className"],
  },
} as const;

async function execute(
  params: Record<string, unknown>
): Promise<AgentToolResult> {
  try {
    const query: SimilarityQuery = {
      className: String(params.className || ""),
      summary: String(params.summary || ""),
      campus: params.campus ? String(params.campus) : undefined,
      category: params.category ? String(params.category) : undefined,
    };

    if (!query.className.trim()) {
      return { success: false, error: "班名不得為空" };
    }

    const threshold = Number(params.threshold) || 0.5;

    const allClasses = await prisma.trainingClass.findMany({
      select: {
        id: true,
        className: true,
        classCode: true,
        summary: true,
        difficultyLevel: true,
        audience: true,
        campus: true,
        category: true,
        deliveryMode: true,
        startDatetime: true,
        mentorName: true,
        instructorNames: true,
      },
    });

    const targets: SimilarityTarget[] = allClasses.map((c) => ({
      ...c,
      trainerName: c.mentorName,
    }));

    const results = computeSimilarity(query, targets, threshold);

    return {
      success: true,
      data: {
        query: query.className,
        threshold,
        matchCount: results.length,
        matches: results.slice(0, 10),
      },
    };
  } catch (e) {
    return { success: false, error: `相似度檢測失敗：${(e as Error).message}` };
  }
}

export const similarityCheckTool: AgentToolExecutor = { definition, execute };
