import { z } from "zod";
import { reasoningMixin } from "./common";
import { NeedsOutputSchema } from "./needs";

/**
 * Skill 2：學員輪廓分析
 *
 * 判斷課程對象、預備知識、學習痛點、不適合報名者。
 * 對應開班計畫表的「對象」、「預備知識」、「對象底下紅字」三個欄位。
 */

export const AudienceInputSchema = z.object({
  needs: NeedsOutputSchema,
});
export type AudienceInput = z.infer<typeof AudienceInputSchema>;

export const AudienceOutputSchema = z.object({
  /** 適合報名的對象（會直接抄到開班計畫表「對象」欄） */
  primaryAudience: z.string().describe("一句話描述適合的對象，例如「需要使用 AI 工具提升文件處理效率的行政同仁」"),
  /** 細分輪廓 */
  segments: z
    .array(
      z.object({
        role: z.string().describe("職務角色"),
        seniority: z.string().describe("年資 / 資深度"),
        priorKnowledge: z.string().describe("先備知識描述"),
        workScenario: z.string().describe("工作場景"),
        learningPainPoints: z.array(z.string()).describe("學習痛點"),
        expectations: z.array(z.string()).describe("對課程的期待"),
      }),
    )
    .min(1),
  /** 預備知識（會直接抄到開班計畫表「預備知識」欄） */
  prerequisites: z.string().describe("學員需具備的先備知識；若無特別要求可填「基本電腦操作能力」"),
  /** 不適合報名的對象（會放進開班計畫表「對象」框內紅字） */
  notSuitableFor: z.array(z.string()).describe("明確列出哪些人不適合，例如「具備程式經驗的初學者，不適合具技術背景的人士報名」"),
  ...reasoningMixin,
});
export type AudienceOutput = z.infer<typeof AudienceOutputSchema>;
