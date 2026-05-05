import { z } from "zod";
import { reasoningMixin } from "./common";
import { OutlineOutputSchema } from "./outline";
import { ScheduleOutputSchema } from "./schedule";
import { InstructorOutputSchema } from "./instructor";
import { AudienceOutputSchema } from "./audience";

/**
 * Skill 8：課程文案
 *
 * 產出招生通知 / 課程介紹 / 報名頁的文字內容。
 * 「輔助文件」類，不直接進開班計畫表。
 */

export const PromoInputSchema = z.object({
  audience: AudienceOutputSchema,
  outline: OutlineOutputSchema,
  schedule: ScheduleOutputSchema,
  instructor: InstructorOutputSchema,
});
export type PromoInput = z.infer<typeof PromoInputSchema>;

export const PromoOutputSchema = z.object({
  /** 文案標題（與 outline.finalTopic 可不同；文案標題可更行銷） */
  title: z.string(),
  /** 一句話 elevator pitch */
  shortIntro: z.string(),
  /** 完整課程介紹（200~400 字） */
  fullDescription: z.string(),
  /** 學員效益條列 */
  benefitBullets: z.array(z.string()).min(3).max(8),
  /** 報名 CTA 文字 */
  callToAction: z.string(),
  ...reasoningMixin,
});
export type PromoOutput = z.infer<typeof PromoOutputSchema>;
