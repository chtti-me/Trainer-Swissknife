import { z } from "zod";
import { reasoningMixin } from "./common";
import { ObjectivesOutputSchema } from "./objectives";
import { OutlineOutputSchema } from "./outline";

/**
 * Skill 11：課程評量
 *
 * 設計如何確認學員真的學會：實作任務／作業／專案／主管觀察表。
 * 「輔助文件」類，不直接進開班計畫表。
 */

export const AssessmentInputSchema = z.object({
  objectives: ObjectivesOutputSchema,
  outline: OutlineOutputSchema,
});
export type AssessmentInput = z.infer<typeof AssessmentInputSchema>;

export const InClassTaskSchema = z.object({
  name: z.string(),
  description: z.string(),
  /** 學員交什麼出來證明學會 */
  evidenceOfLearning: z.string(),
});
export type InClassTask = z.infer<typeof InClassTaskSchema>;

export const AssessmentOutputSchema = z.object({
  /** 課前評估（測驗 / 自評問卷） */
  preAssessment: z.string().optional(),
  /** 課中實作任務 */
  inClassTasks: z.array(InClassTaskSchema).min(1),
  /** 課後評估（測驗 / 報告） */
  postAssessment: z.string().optional(),
  /** 結業專案（若適用） */
  finalProject: z.string().optional(),
  /** 主管觀察表（若適用） */
  managerObservationForm: z.string().optional(),
  ...reasoningMixin,
});
export type AssessmentOutput = z.infer<typeof AssessmentOutputSchema>;
