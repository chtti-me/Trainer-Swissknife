import { z } from "zod";
import { reasoningMixin } from "./common";
import { OutlineOutputSchema } from "./outline";

/**
 * Skill 6：講師媒合
 *
 * 4 來源：個人師資人脈 / 培訓師名冊（TIS 導師）/ 歷史授課 / 網路（OpenAI 模式才有）+ AI 推薦。
 * 為每堂課產出主推 1 + 備選 N，每位都標註來源。
 */

export const InstructorSourceSchema = z.enum([
  "personal", // 個人師資人脈 PersonalInstructorContact
  "trainer", // 培訓師名冊 Trainer
  "history", // 歷史授課紀錄 TrainingClass.instructorNames
  "web", // OpenAI Responses web_search_preview
  "ai_recommendation", // 純 AI 推薦
]);
export type InstructorSource = z.infer<typeof InstructorSourceSchema>;

export const CandidateSchema = z.object({
  name: z.string(),
  source: InstructorSourceSchema,
  expertise: z.string().describe("擅長領域"),
  organization: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  /** 為什麼這位適合這堂課 */
  fitReasoning: z.string(),
  /** 風險／注意事項 */
  notes: z.string().optional(),
});
export type Candidate = z.infer<typeof CandidateSchema>;

export const SessionInstructorMatchSchema = z.object({
  /** 對應 OutlineSession.position */
  sessionPosition: z.number().int().min(1),
  sessionName: z.string(),
  primary: CandidateSchema,
  alternatives: z.array(CandidateSchema).default([]),
});
export type SessionInstructorMatch = z.infer<typeof SessionInstructorMatchSchema>;

export const InstructorInputSchema = z.object({
  outline: OutlineOutputSchema,
  /** 每堂課的 4 來源候選人（由 instructor-lookup.ts 預先抓好） */
  candidatesPerSession: z.array(
    z.object({
      sessionPosition: z.number().int().min(1),
      sessionName: z.string(),
      personalContacts: z.array(CandidateSchema).default([]),
      trainers: z.array(CandidateSchema).default([]),
      historyInstructors: z.array(CandidateSchema).default([]),
      webResults: z.array(CandidateSchema).default([]),
    }),
  ),
});
export type InstructorInput = z.infer<typeof InstructorInputSchema>;

export const InstructorOutputSchema = z.object({
  matches: z.array(SessionInstructorMatchSchema),
  /** 整個班的講師選擇策略總結（內聘 vs 外聘 vs 混合） */
  overallStrategy: z.string(),
  /** 是否做了網路搜尋（Gemini 模式會是 false） */
  webSearchPerformed: z.boolean(),
  ...reasoningMixin,
});
export type InstructorOutput = z.infer<typeof InstructorOutputSchema>;
