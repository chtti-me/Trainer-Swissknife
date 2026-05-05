import { z } from "zod";
import { reasoningMixin } from "./common";
import { OutlineOutputSchema } from "./outline";

/**
 * Skill 10：教材資源
 *
 * 規劃需要哪些教材：投影片 / 講義 / 範例檔 / 練習資料。
 * 「輔助文件」類；同時把「課程特色」的教材視角填進開班計畫表「課程資源 課前/課中/課後」欄。
 */

export const MaterialsInputSchema = z.object({
  outline: OutlineOutputSchema,
});
export type MaterialsInput = z.infer<typeof MaterialsInputSchema>;

export const MaterialItemSchema = z.object({
  name: z.string(),
  purpose: z.string(),
});
export type MaterialItem = z.infer<typeof MaterialItemSchema>;

export const MaterialsOutputSchema = z.object({
  slides: z.array(MaterialItemSchema).default([]),
  handouts: z.array(MaterialItemSchema).default([]),
  examples: z.array(MaterialItemSchema).default([]),
  exercises: z.array(MaterialItemSchema).default([]),
  /** 課前 / 課中 / 課後 三段教學特色（會被 form-mapper 用） */
  preClassFeatures: z.array(z.string()).default([]),
  inClassFeatures: z.array(z.string()).default([]),
  postClassFeatures: z.array(z.string()).default([]),
  ...reasoningMixin,
});
export type MaterialsOutput = z.infer<typeof MaterialsOutputSchema>;
