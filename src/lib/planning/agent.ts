/**
 * 精簡版課程規劃幫手 - AI Agent
 * 一次產出開班計劃表所需的所有欄位
 */
import "server-only";

import {
  createAiClient,
  getAiProvider,
  getPlanningModel,
  hasConfiguredAiApiKey,
  supportsBuiltInWebSearch,
} from "@/lib/ai-provider";
import type { CoursePlanInput, CoursePlanResult, CourseModule, InstructorSuggestion } from "./types";

export interface CoursePlanAgentOptions {
  skillContextAppend?: string;
}

const AI_PROVIDER = getAiProvider();
const openai = createAiClient();
const MODEL = getPlanningModel(AI_PROVIDER);

const SYSTEM_PROMPT = `你是一位資深課程規劃師，擁有 15 年以上企業培訓經驗，擅長將模糊需求轉化為可執行的課程規劃。

你的特長：
- 快速理解企業培訓需求的核心問題
- 設計實務導向、可落地的課程架構
- 熟悉各領域的知名講師與專家
- 精準掌握課程時數與模組配置

你的產出必須符合「開班計劃表」格式，聚焦於可執行的課程規劃。`;

function buildPrompt(input: CoursePlanInput, skillAppend?: string): string {
  const { requirementText, preferredTitle, preferredHours } = input;

  let prompt = `請根據以下培訓需求，產出「開班計劃表」所需的課程規劃資訊。

## 培訓需求
---
${requirementText.slice(0, 15000)}
---
`;

  if (preferredTitle) {
    prompt += `\n使用者偏好的課程名稱：${preferredTitle}\n`;
  }
  if (preferredHours) {
    prompt += `\n使用者偏好的總時數：${preferredHours} 小時\n`;
  }

  prompt += `
## 輸出格式（JSON）

請**只輸出一個 JSON 物件**，不要其他文字，欄位如下：

{
  "suggestedTitle": "建議班名（主題），例如：【基礎】生成式AI應用實務班",
  "objective": "課程目標，1-2 句話說明學員完成課程後能做到什麼",
  "targetAudience": "培訓對象，說明適合哪些人參加",
  "prerequisites": "預備知識，說明學員需要具備的先備條件",
  "totalHours": 12,
  "modules": [
    { "name": "課程模組名稱", "hours": 3 }
  ],
  "instructors": [
    { "name": "講師姓名或方向", "expertise": "教學領域", "source": "ai_recommendation" }
  ]
}

## 規則

1. suggestedTitle 格式：【難度】課程主題，難度為：基礎/進階/高級/專精
2. objective 必須具體可衡量，說明學員能產出什麼或能做到什麼
3. targetAudience 要明確，例如「需要製作簡報的行銷人員」而非「一般員工」
4. prerequisites 若無特別要求可填「基本電腦操作能力」
5. modules 至少 3 個、最多 6 個，時數總和應等於 totalHours
6. instructors 至少推薦 2 位、最多 4 位：
   - 根據課程主題推薦該領域的知名講師、專家或顧問
   - expertise 填寫該講師的專長領域
   - source 固定填 "ai_recommendation"
7. 所有文字使用繁體中文
`;

  if (skillAppend?.trim()) {
    prompt += `\n${skillAppend.trim()}\n`;
  }

  return prompt;
}

async function searchInstructors(topic: string, count: number): Promise<InstructorSuggestion[]> {
  if (!supportsBuiltInWebSearch(AI_PROVIDER)) {
    return [];
  }

  try {
    const searchPrompt = `請搜尋「${topic}」領域的知名講師、培訓師或專家，找出 ${count} 位適合企業培訓的人選。`;

    const response = await openai.responses.create({
      model: MODEL,
      input: searchPrompt,
      tools: [{ type: "web_search_preview" }],
    });

    const instructors: InstructorSuggestion[] = [];
    const seen = new Set<string>();

    const output = (response as { output?: Array<{ content?: Array<{ annotations?: unknown[] }> }> })?.output ?? [];
    for (const item of output) {
      const content = item.content ?? [];
      for (const part of content) {
        const annotations = Array.isArray((part as { annotations?: unknown[] }).annotations)
          ? (part as { annotations: unknown[] }).annotations
          : [];
        for (const ann of annotations) {
          const a = ann as { type?: string; title?: string; url?: string };
          if (a.type !== "url_citation") continue;
          const title = String(a.title ?? "").trim();
          if (!title || seen.has(title)) continue;
          seen.add(title);
          instructors.push({
            name: title.slice(0, 50),
            expertise: topic,
            source: "web_search",
          });
          if (instructors.length >= count) break;
        }
        if (instructors.length >= count) break;
      }
      if (instructors.length >= count) break;
    }

    return instructors;
  } catch (e) {
    console.error("[instructor search]", e);
    return [];
  }
}

function normalizeResult(raw: unknown, input: CoursePlanInput): CoursePlanResult {
  const data = raw as Record<string, unknown>;

  const suggestedTitle = String(data.suggestedTitle ?? "").trim() || "企業培訓課程";
  const objective = String(data.objective ?? "").trim() || "提升學員專業能力";
  const targetAudience = String(data.targetAudience ?? "").trim() || "相關領域從業人員";
  const prerequisites = String(data.prerequisites ?? "").trim() || "基本電腦操作能力";

  let totalHours = Number(data.totalHours) || input.preferredHours || 12;
  if (totalHours < 1) totalHours = 12;

  const rawModules = Array.isArray(data.modules) ? data.modules : [];
  const modules: CourseModule[] = rawModules
    .map((m) => {
      const mod = m as Record<string, unknown>;
      return {
        name: String(mod.name ?? "").trim() || "課程單元",
        hours: Math.max(0.5, Number(mod.hours) || 1),
      };
    })
    .filter((m) => m.name)
    .slice(0, 8);

  if (modules.length === 0) {
    modules.push(
      { name: "課程概論與基礎", hours: 2 },
      { name: "核心概念與實務", hours: Math.floor(totalHours * 0.5) },
      { name: "案例演練與總結", hours: totalHours - 2 - Math.floor(totalHours * 0.5) }
    );
  }

  const rawInstructors = Array.isArray(data.instructors) ? data.instructors : [];
  const instructors: InstructorSuggestion[] = rawInstructors
    .map((i) => {
      const inst = i as Record<string, unknown>;
      return {
        name: String(inst.name ?? "").trim(),
        expertise: String(inst.expertise ?? "").trim() || "相關領域",
        source: (inst.source === "web_search" ? "web_search" : "ai_recommendation") as "web_search" | "ai_recommendation",
      };
    })
    .filter((i) => i.name)
    .slice(0, 6);

  return {
    suggestedTitle,
    objective,
    targetAudience,
    prerequisites,
    totalHours,
    modules,
    instructors,
  };
}

function getMockResult(input: CoursePlanInput): CoursePlanResult {
  const firstLine = input.requirementText.split("\n")[0]?.slice(0, 30) || "培訓課程";
  return {
    suggestedTitle: `【基礎】${firstLine}實務班`,
    objective: "學員完成課程後能夠掌握核心概念並應用於實際工作中",
    targetAudience: "需要提升相關技能的從業人員",
    prerequisites: "基本電腦操作能力",
    totalHours: input.preferredHours || 12,
    modules: [
      { name: "課程概論與基礎概念", hours: 2 },
      { name: "核心技術與方法", hours: 4 },
      { name: "實務案例演練", hours: 4 },
      { name: "總結與應用建議", hours: 2 },
    ],
    instructors: [
      { name: "領域專家（請依需求洽詢）", expertise: "相關領域", source: "ai_recommendation" },
      { name: "內部資深同仁（待指派）", expertise: "實務經驗", source: "ai_recommendation" },
    ],
  };
}

/**
 * 執行課程規劃 AI Agent
 * 一次產出開班計劃表所需的所有欄位
 */
export async function runCoursePlanAgent(
  input: CoursePlanInput,
  options?: CoursePlanAgentOptions
): Promise<CoursePlanResult> {
  if (!hasConfiguredAiApiKey()) {
    console.log("[course plan agent] No API key configured, using mock result");
    return getMockResult(input);
  }

  try {
    const prompt = buildPrompt(input, options?.skillContextAppend);

    const messages: Array<{ role: "system" | "user"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ];

    // Gemini OpenAI-compatible 端點對 response_format 支援不穩定，僅 OpenAI 模式使用
    const response = AI_PROVIDER === "openai"
      ? await openai.chat.completions.create({
          model: MODEL, messages, temperature: 0.4,
          response_format: { type: "json_object" },
        })
      : await openai.chat.completions.create({
          model: MODEL, messages, temperature: 0.4,
        });

    const content = response.choices[0]?.message?.content || "{}";

    let parsed: unknown;
    try {
      // Gemini 可能回傳含 markdown 程式碼區塊的 JSON，嘗試擷取
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[1].trim() : content);
    } catch {
      parsed = JSON.parse(content.replace(/^[^{]*/, "").replace(/[^}]*$/, ""));
    }
    const result = normalizeResult(parsed, input);

    if (supportsBuiltInWebSearch(AI_PROVIDER) && result.instructors.length < 2) {
      const topic = result.suggestedTitle.replace(/【[^】]+】/, "").trim();
      const webInstructors = await searchInstructors(topic, 3);
      if (webInstructors.length > 0) {
        result.instructors = [...webInstructors, ...result.instructors].slice(0, 4);
      }
    }

    if (result.instructors.length === 0) {
      result.instructors = [
        { name: "領域專家（請依需求洽詢）", expertise: "相關領域", source: "ai_recommendation" },
        { name: "內部資深同仁（待指派）", expertise: "實務經驗", source: "ai_recommendation" },
      ];
    }

    return result;
  } catch (e) {
    console.error("[course plan agent]", e);
    return getMockResult(input);
  }
}
