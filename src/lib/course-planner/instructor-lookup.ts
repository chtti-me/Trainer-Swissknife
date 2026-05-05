/**
 * 課程規劃幫手 — 講師媒合的 4 來源純函式查詢
 *
 * 學自 src/lib/agent/tools/instructor-search.ts，但拆成 4 支獨立函式，
 * 不走 Agent tool 路徑（不再多一層 LLM 呼叫成本），讓 Skill 6 直接組合結果。
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { createAiClient, getAiProvider, getPlanningModel, supportsBuiltInWebSearch } from "@/lib/ai-provider";
import type { Candidate, InstructorSource } from "./schemas/instructor";

export interface InstructorLookupBundle {
  personalContacts: Candidate[];
  trainers: Candidate[];
  historyInstructors: Candidate[];
  webResults: Candidate[];
  /** 是否做了網路搜尋（OpenAI 模式才會 true） */
  webSearchPerformed: boolean;
}

const tag = (source: InstructorSource) => source;

export async function lookupPersonalContacts(
  userId: string,
  keyword: string,
  limit = 5,
): Promise<Candidate[]> {
  const rows = await prisma.personalInstructorContact.findMany({
    where: {
      ownerId: userId,
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
  });
  return rows.map((r) => ({
    name: r.displayName,
    source: tag("personal"),
    expertise: r.expertiseDomains || r.title || "未填",
    organization: r.organization ?? undefined,
    email: r.email ?? undefined,
    phone: r.phone ?? undefined,
    fitReasoning: "",
    notes: r.notes ?? undefined,
  }));
}

export async function lookupTrainers(keyword: string, limit = 5): Promise<Candidate[]> {
  const rows = await prisma.trainer.findMany({
    where: {
      active: true,
      OR: [
        { name: { contains: keyword } },
        { expertiseTags: { contains: keyword } },
        { teachingTopics: { contains: keyword } },
        { organization: { contains: keyword } },
      ],
    },
    take: limit,
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    name: r.name,
    source: tag("trainer"),
    expertise: r.expertiseTags || r.teachingTopics || "未填",
    organization: r.organization ?? undefined,
    email: r.email ?? undefined,
    phone: r.phone ?? undefined,
    fitReasoning: "",
    notes: r.notes ?? undefined,
  }));
}

export async function lookupHistoryInstructors(keyword: string, limit = 5): Promise<Candidate[]> {
  const rows = await prisma.trainingClass.findMany({
    where: {
      instructorNames: { not: null },
      OR: [
        { className: { contains: keyword } },
        { instructorNames: { contains: keyword } },
        { category: { contains: keyword } },
      ],
    },
    take: limit * 4,
    orderBy: { startDatetime: "desc" },
    select: {
      className: true,
      instructorNames: true,
      category: true,
    },
  });

  const map = new Map<string, { count: number; classes: Set<string>; categories: Set<string> }>();
  for (const cls of rows) {
    if (!cls.instructorNames) continue;
    const names = cls.instructorNames.split(/[,、；;／/\s]+/).map((n) => n.trim()).filter(Boolean);
    for (const name of names) {
      const existing = map.get(name);
      if (existing) {
        existing.count += 1;
        existing.classes.add(cls.className);
        if (cls.category) existing.categories.add(cls.category);
      } else {
        map.set(name, {
          count: 1,
          classes: new Set([cls.className]),
          categories: cls.category ? new Set([cls.category]) : new Set(),
        });
      }
    }
  }

  return Array.from(map.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([name, data]) => ({
      name,
      source: tag("history"),
      expertise: Array.from(data.categories).join("、") || "歷史授課紀錄",
      fitReasoning: "",
      notes: `歷史授課 ${data.count} 次：${Array.from(data.classes).slice(0, 3).join("、")}`,
    }));
}

/**
 * 透過 OpenAI Responses API 的 web_search_preview 工具找網路上講師線索。
 * 僅 AI_PROVIDER=openai 時可用；Gemini 模式回空陣列並標記 webSearchPerformed=false。
 */
export async function searchWebInstructors(keyword: string, limit = 3): Promise<Candidate[]> {
  const provider = getAiProvider();
  if (!supportsBuiltInWebSearch(provider)) return [];

  try {
    const client = createAiClient();
    const model = getPlanningModel(provider);
    const searchPrompt = `請搜尋「${keyword}」這個主題在台灣有哪些知名的講師、培訓師或專家，可以擔任企業內訓的講師。請列出 ${limit} 位，每位給姓名與一行專長簡介。`;

    const response = await client.responses.create({
      model,
      input: searchPrompt,
      tools: [{ type: "web_search_preview" }],
    });

    const candidates: Candidate[] = [];
    const seen = new Set<string>();
    const output = (response as { output?: Array<{ content?: Array<{ annotations?: unknown[] }> }> }).output ?? [];
    for (const item of output) {
      const content = item.content ?? [];
      for (const part of content) {
        const annotations = Array.isArray((part as { annotations?: unknown[] }).annotations)
          ? ((part as { annotations: unknown[] }).annotations as Array<{ type?: string; title?: string; url?: string }>)
          : [];
        for (const ann of annotations) {
          if (ann.type !== "url_citation") continue;
          const title = String(ann.title ?? "").trim();
          if (!title || seen.has(title)) continue;
          seen.add(title);
          candidates.push({
            name: title.slice(0, 50),
            source: tag("web"),
            expertise: keyword,
            fitReasoning: "",
            notes: ann.url ? `來源：${ann.url}` : undefined,
          });
          if (candidates.length >= limit) break;
        }
        if (candidates.length >= limit) break;
      }
      if (candidates.length >= limit) break;
    }
    return candidates;
  } catch (e) {
    console.warn("[course-planner instructor-lookup] web 搜尋失敗：", (e as Error).message);
    return [];
  }
}

/**
 * 對單個關鍵字（通常是堂課名 / 主題）跑 4 來源查詢，組成 bundle。
 */
export async function lookupAllSources(
  userId: string,
  keyword: string,
  options?: { limit?: number },
): Promise<InstructorLookupBundle> {
  const limit = options?.limit ?? 5;
  const provider = getAiProvider();
  const willSearchWeb = supportsBuiltInWebSearch(provider);

  const [personalContacts, trainers, historyInstructors, webResults] = await Promise.all([
    lookupPersonalContacts(userId, keyword, limit),
    lookupTrainers(keyword, limit),
    lookupHistoryInstructors(keyword, limit),
    willSearchWeb ? searchWebInstructors(keyword, 3) : Promise.resolve<Candidate[]>([]),
  ]);

  return {
    personalContacts,
    trainers,
    historyInstructors,
    webResults,
    webSearchPerformed: willSearchWeb,
  };
}
