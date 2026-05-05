import { z } from "zod";

/**
 * 所有 Skill output 都必須附帶 reasoning / assumptions / confidence。
 * 這不是裝飾——讓培訓師可以檢視 AI 為什麼這樣判斷、是否值得採信。
 */
export const reasoningMixin = {
  reasoning: z
    .string()
    .min(1, "必須說明判斷依據")
    .describe("1~3 句話說明你為什麼這樣判斷／設計"),
  assumptions: z
    .array(z.string())
    .default([])
    .describe("為了補完欄位所做的合理假設（沒有就空陣列）"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("自評信心度 0.0 ~ 1.0，輸入資訊不足就給較低分"),
} as const;

/**
 * 所有 Skill 名稱列舉（含前置 existing_lookup）。
 * orchestrator / SkillRun.skillName / API path 都用這份命名。
 */
export const SKILL_NAMES = [
  "existing_lookup",
  "needs",
  "audience",
  "objectives",
  "outline",
  "format",
  "instructor",
  "schedule",
  "promo",
  "notification",
  "materials",
  "assessment",
] as const;

export type SkillName = (typeof SKILL_NAMES)[number];

export const SkillNameSchema = z.enum(SKILL_NAMES);

/**
 * 11 個會跑 LLM 的 Skill（不含 existing_lookup 前置步驟）。
 */
export const LLM_SKILL_NAMES = [
  "needs",
  "audience",
  "objectives",
  "outline",
  "format",
  "instructor",
  "schedule",
  "promo",
  "notification",
  "materials",
  "assessment",
] as const;

export type LlmSkillName = (typeof LLM_SKILL_NAMES)[number];

/**
 * Skill 中文顯示名（給 UI 與培訓師看的）。
 */
export const SKILL_DISPLAY_NAMES: Record<SkillName, string> = {
  existing_lookup: "既有班相似度搜尋",
  needs: "訓練需求分析",
  audience: "學員輪廓分析",
  objectives: "學習目標設計",
  outline: "課程大綱設計",
  format: "課程形式選擇",
  instructor: "講師媒合",
  schedule: "課程時程規劃",
  promo: "課程文案",
  notification: "課前通知",
  materials: "教材資源",
  assessment: "課程評量",
};

/**
 * Skill 是否「直接填開班計畫表」(form) 還是「輔助文件」(aux)。
 * 用於 UI 分組顯示。
 */
export const SKILL_KIND: Record<LlmSkillName, "form" | "aux"> = {
  needs: "form",
  audience: "form",
  objectives: "form",
  outline: "form",
  format: "form",
  instructor: "form",
  schedule: "form",
  promo: "aux",
  notification: "aux",
  materials: "aux",
  assessment: "aux",
};

/**
 * 上游依賴（執行順序的依賴圖）。
 * 第一版採線性順序執行，但 form-mapper 會用這份做拓樸排序的 sanity check。
 */
export const SKILL_UPSTREAM: Record<LlmSkillName, LlmSkillName[]> = {
  needs: [],
  audience: ["needs"],
  objectives: ["needs", "audience"],
  outline: ["objectives"],
  format: ["audience", "outline"],
  instructor: ["outline"],
  schedule: ["outline", "format"],
  promo: ["outline", "schedule", "instructor"],
  notification: ["schedule", "format"],
  materials: ["outline"],
  assessment: ["objectives", "outline"],
};

/**
 * 第一版線性執行順序。
 * 嚴格依此順序串：每一步的 input 從上游 SkillRun.output 拼接。
 */
export const SKILL_PIPELINE_ORDER: readonly LlmSkillName[] = [
  "needs",
  "audience",
  "objectives",
  "outline",
  "format",
  "instructor",
  "schedule",
  "materials",
  "assessment",
  "notification",
  "promo",
];
