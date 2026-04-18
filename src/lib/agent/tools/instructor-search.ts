/**
 * Agent 工具：師資推薦搜尋
 * 從「個人師資人脈」、「培訓師名冊」、「歷史開班講師紀錄」三大來源搜尋合適講師，
 * 並可搭配 web_search 做 Internet 搜尋延伸。
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import type { AgentToolExecutor, AgentToolResult, AgentExecutionContext } from "../types";

const definition = {
  name: "instructor_search",
  description:
    "師資推薦搜尋工具。根據課程主題、專長領域等關鍵字，從以下三大來源搜尋合適的講師：\n" +
    "1. 個人師資人脈（PersonalInstructorContact）：使用者自行維護的講師聯絡資料，包含姓名、頭銜、組織、專長領域、聯絡方式等\n" +
    "2. 培訓師名冊（Trainer）：系統中所有培訓師資料\n" +
    "3. 歷史開班講師紀錄（TrainingClass.instructorNames）：過去曾擔任特定類型課程講師的人員\n\n" +
    "使用此工具可協助培訓師快速找到適合某課程主題的師資人選。如需更多外部講師資訊，可搭配 web_search 工具。",
  parameters: {
    type: "object",
    properties: {
      keyword: {
        type: "string",
        description: "搜尋關鍵字（課程主題、專長領域、講師姓名皆可）",
      },
      source: {
        type: "string",
        enum: ["all", "personal", "trainers", "history"],
        description:
          "搜尋來源：all（全部，預設）、personal（個人師資人脈）、trainers（培訓師名冊）、history（歷史授課紀錄）",
      },
      limit: {
        type: "number",
        description: "每個來源回傳的最大筆數（預設 10，最大 30）",
      },
    },
    required: ["keyword"],
  },
} as const;

interface PersonalContact {
  id: string;
  displayName: string;
  title: string | null;
  organization: string | null;
  expertiseDomains: string | null;
  email: string | null;
  phone: string | null;
  lineId: string | null;
  notes: string | null;
}

interface TrainerRow {
  id: string;
  name: string;
  trainerType: string | null;
  expertiseTags: string | null;
  email: string | null;
  organization: string | null;
}

interface HistoryInstructor {
  instructorName: string;
  classNames: string[];
  count: number;
}

async function execute(
  params: Record<string, unknown>,
  ctx: AgentExecutionContext
): Promise<AgentToolResult> {
  try {
    const keyword = String(params.keyword || "").trim();
    if (!keyword) {
      return { success: false, error: "請提供搜尋關鍵字（課程主題或講師姓名）" };
    }

    const source = String(params.source || "all");
    const limit = Math.min(Math.max(1, Number(params.limit) || 10), 30);
    const results: Record<string, unknown> = {};

    // 1. 個人師資人脈
    if (source === "all" || source === "personal") {
      const contacts = await prisma.personalInstructorContact.findMany({
        where: {
          ownerId: ctx.userId,
          OR: [
            { displayName: { contains: keyword } },
            { expertiseDomains: { contains: keyword } },
            { organization: { contains: keyword } },
            { title: { contains: keyword } },
            { notes: { contains: keyword } },
          ],
        },
        take: limit,
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          displayName: true,
          title: true,
          organization: true,
          expertiseDomains: true,
          email: true,
          phone: true,
          lineId: true,
          notes: true,
        },
      });

      const formatted: PersonalContact[] = contacts;
      results.personalContacts = {
        source: "個人師資人脈",
        count: formatted.length,
        rows: formatted,
      };
    }

    // 2. 培訓師名冊
    if (source === "all" || source === "trainers") {
      const trainers = await prisma.trainer.findMany({
        where: {
          active: true,
          OR: [
            { name: { contains: keyword } },
            { expertiseTags: { contains: keyword } },
            { organization: { contains: keyword } },
          ],
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

      const formatted: TrainerRow[] = trainers;
      results.trainers = {
        source: "培訓師名冊",
        count: formatted.length,
        rows: formatted,
      };
    }

    // 3. 歷史開班講師紀錄
    if (source === "all" || source === "history") {
      const classes = await prisma.trainingClass.findMany({
        where: {
          instructorNames: { not: null },
          OR: [
            { className: { contains: keyword } },
            { instructorNames: { contains: keyword } },
            { category: { contains: keyword } },
            { audience: { contains: keyword } },
          ],
        },
        take: limit * 3,
        orderBy: { startDatetime: "desc" },
        select: {
          className: true,
          instructorNames: true,
          category: true,
          startDatetime: true,
        },
      });

      const instructorMap = new Map<string, { classNames: Set<string>; count: number }>();
      for (const cls of classes) {
        if (!cls.instructorNames) continue;
        const names = cls.instructorNames
          .split(/[,、；;／/\s]+/)
          .map((n) => n.trim())
          .filter(Boolean);

        for (const name of names) {
          const existing = instructorMap.get(name);
          if (existing) {
            existing.classNames.add(cls.className);
            existing.count++;
          } else {
            instructorMap.set(name, {
              classNames: new Set([cls.className]),
              count: 1,
            });
          }
        }
      }

      const history: HistoryInstructor[] = Array.from(instructorMap.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, limit)
        .map(([name, data]) => ({
          instructorName: name,
          classNames: Array.from(data.classNames).slice(0, 5),
          count: data.count,
        }));

      results.historyInstructors = {
        source: "歷史開班講師紀錄",
        count: history.length,
        rows: history,
      };
    }

    const totalFound =
      ((results.personalContacts as { count: number })?.count || 0) +
      ((results.trainers as { count: number })?.count || 0) +
      ((results.historyInstructors as { count: number })?.count || 0);

    return {
      success: true,
      data: {
        keyword,
        totalFound,
        ...results,
        hint: totalFound === 0
          ? "系統內未找到符合條件的師資。建議使用 web_search 工具在 Internet 上搜尋外部講師資訊。"
          : "以上為系統內的師資搜尋結果。如需更多外部講師資訊，可再使用 web_search 工具搜尋。",
      },
    };
  } catch (e) {
    return { success: false, error: `師資搜尋失敗：${(e as Error).message}` };
  }
}

export const instructorSearchTool: AgentToolExecutor = { definition, execute };
