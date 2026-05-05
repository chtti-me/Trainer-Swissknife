import { z } from "zod";
import { reasoningMixin } from "./common";
import { NeedsOutputSchema } from "./needs";
import { AudienceOutputSchema } from "./audience";

/**
 * Skill 3：學習目標設計
 *
 * 把模糊需求轉成可被驗證的學習目標。
 * 不寫 Bloom，直接用「學員完成課程後能做到 X」這種白話格式。
 */

export const ObjectivesInputSchema = z.object({
  needs: NeedsOutputSchema,
  audience: AudienceOutputSchema,
});
export type ObjectivesInput = z.infer<typeof ObjectivesInputSchema>;

export const LearningObjectiveSchema = z.object({
  id: z.number().int().min(1).describe("目標編號（1, 2, 3…），下游 Skill 會引用"),
  /** 學員完成課程後能做到 X — 白話可被驗證的句子 */
  statement: z.string().describe("一句話描述學員完成後能做到什麼"),
  /** 如何驗證學員真的學會 */
  evidence: z.string().describe("用什麼方式驗證學員達標（產出物／實作演練／測驗）"),
  /** 主管或工作上能觀察到的行為改變 */
  observableBehavior: z.string().optional().describe("主管在工作中能觀察到的行為（不寫太抽象）"),
});
export type LearningObjective = z.infer<typeof LearningObjectiveSchema>;

export const ObjectivesOutputSchema = z.object({
  /** 一段話描述「課程終點」 */
  endpoint: z.string().describe("學員完成整套課程後能做到什麼（一段話）"),
  /** 條列學習目標（會放到開班計畫表「目標」欄） */
  objectives: z.array(LearningObjectiveSchema).min(2).max(8),
  ...reasoningMixin,
});
export type ObjectivesOutput = z.infer<typeof ObjectivesOutputSchema>;
