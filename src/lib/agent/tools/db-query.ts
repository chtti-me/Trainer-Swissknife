/**
 * Agent 工具：資料庫查詢
 * 查詢班次、培訓師等資料（唯讀）。
 */
import "server-only";

import type { AgentToolExecutor, AgentToolResult } from "../types";
import { prisma } from "@/lib/prisma";

const definition = {
  name: "db_query",
  description:
    "查詢系統資料庫中的班次（TrainingClass）或培訓師（Trainer）資料。支援班名關鍵字搜尋、院所別篩選、日期範圍等條件。回傳前 20 筆符合條件的結果。",
  parameters: {
    type: "object",
    properties: {
      table: {
        type: "string",
        enum: ["training_classes", "trainers"],
        description: "要查詢的資料表",
      },
      keyword: {
        type: "string",
        description: "班名或培訓師姓名的關鍵字（模糊搜尋）",
      },
      campus: {
        type: "string",
        description: "院所別篩選（院本部、台中所、高雄所）",
      },
      limit: {
        type: "number",
        description: "回傳筆數上限（預設 20，最大 50）",
      },
    },
    required: ["table"],
  },
} as const;

async function execute(
  params: Record<string, unknown>
): Promise<AgentToolResult> {
  try {
    const table = String(params.table || "training_classes");
    const keyword = params.keyword ? String(params.keyword) : undefined;
    const campus = params.campus ? String(params.campus) : undefined;
    const limit = Math.min(Math.max(1, Number(params.limit) || 20), 50);

    if (table === "trainers") {
      const trainers = await prisma.trainer.findMany({
        where: {
          ...(keyword ? { name: { contains: keyword } } : {}),
          active: true,
        },
        take: limit,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          trainerType: true,
          expertiseTags: true,
          email: true,
          organization: true,
        },
      });
      return { success: true, data: { table: "trainers", count: trainers.length, rows: trainers } };
    }

    const classes = await prisma.trainingClass.findMany({
      where: {
        ...(keyword ? { className: { contains: keyword } } : {}),
        ...(campus ? { campus } : {}),
      },
      take: limit,
      orderBy: { startDatetime: "desc" },
      select: {
        id: true,
        classCode: true,
        className: true,
        campus: true,
        category: true,
        startDatetime: true,
        endDatetime: true,
        status: true,
        mentorName: true,
        instructorNames: true,
        deliveryMode: true,
        difficultyLevel: true,
        audience: true,
      },
    });

    return { success: true, data: { table: "training_classes", count: classes.length, rows: classes } };
  } catch (e) {
    return { success: false, error: `資料庫查詢失敗：${(e as Error).message}` };
  }
}

export const dbQueryTool: AgentToolExecutor = { definition, execute };
