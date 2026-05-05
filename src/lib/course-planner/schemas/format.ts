import { z } from "zod";
import { reasoningMixin } from "./common";
import { AudienceOutputSchema } from "./audience";
import { OutlineOutputSchema } from "./outline";

/**
 * Skill 5：課程形式選擇
 *
 * 決定授課形式（實體／線上／混成…）、教學方法、工具平台。
 *
 * 註：開班性質、報到地點、對內／對外…等屬於中華電信學院的 meta data，
 * 已從 schema 中移除，由培訓師在學院系統內自行填寫。
 */

export const FormatInputSchema = z.object({
  audience: AudienceOutputSchema,
  outline: OutlineOutputSchema,
});
export type FormatInput = z.infer<typeof FormatInputSchema>;

export const FormatOutputSchema = z.object({
  /** 主要授課形式 */
  primaryFormat: z.enum([
    "in_person",
    "online_live",
    "online_async",
    "hybrid",
    "workshop",
    "self_paced",
  ]),
  /** 為什麼選這種形式 */
  formatRationale: z.string(),
  /** 採用的教學方法（互動演練／講授／案例討論／…） */
  teachingMethods: z.array(z.string()),
  /** 工具與平台（Zoom／Teams／實體教室…） */
  toolsAndPlatforms: z.array(z.string()),
  ...reasoningMixin,
});
export type FormatOutput = z.infer<typeof FormatOutputSchema>;
