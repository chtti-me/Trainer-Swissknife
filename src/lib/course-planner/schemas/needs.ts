import { z } from "zod";
import { reasoningMixin } from "./common";

/**
 * Skill 1：訓練需求分析
 *
 * 釐清「為什麼要開課、誰要開、要解決什麼真問題」。
 * 不要把症狀當問題。若根因不是培訓能解決的（制度／流程／激勵），標出來。
 */

export const NeedsInputSchema = z.object({
  rawInputText: z.string().min(1).describe("培訓師貼上的原始需求文字（含可能的檔案內容）"),
  /** 既有班搜尋的命中清單，用於 prompt 中提示「市面上有沒有類似班」 */
  similarExistingClasses: z
    .array(
      z.object({
        className: z.string(),
        category: z.string().nullable(),
        score: z.number(),
      }),
    )
    .default([]),
});
export type NeedsInput = z.infer<typeof NeedsInputSchema>;

export const NeedsOutputSchema = z.object({
  /** 一句話摘要這個培訓需求是什麼 */
  needsSummary: z.string().describe("一句話摘要：誰、要學什麼、要解決什麼問題"),
  /** 需求方提到的痛點（症狀） */
  reportedPainPoints: z.array(z.string()).default([]),
  /** 真正的能力差距（你的判斷） */
  capabilityGaps: z
    .array(
      z.object({
        gap: z.string().describe("具體能力差距描述"),
        whoLacks: z.string().describe("哪一群人欠缺"),
        evidenceFromInput: z.string().describe("從原始需求中支持此判斷的線索"),
      }),
    )
    .min(1, "至少要識別一個能力差距"),
  /** 是否為培訓能解決的問題；若否要說明該採取什麼非培訓行動 */
  isTrainingProblem: z.boolean().describe("這個問題是不是培訓真的能解？"),
  nonTrainingAdvice: z.string().optional().describe("若 isTrainingProblem=false，建議該做什麼非培訓行動"),
  /** 建議課程主題方向（給 outline Skill 用） */
  topicDirections: z
    .array(z.string())
    .min(1)
    .describe("此案可成為什麼樣的課程；提 1~3 個主題方向關鍵字／短句"),
  /** 案由說明（直接填到開班計畫表「案由說明」欄） */
  caseRationale: z.string().describe("用培訓師會直接抄到開班計畫表「案由說明」欄的口吻寫"),
  /** 缺漏資訊（請培訓師補充） */
  missingInfo: z.array(z.string()).default([]),
  ...reasoningMixin,
});
export type NeedsOutput = z.infer<typeof NeedsOutputSchema>;
