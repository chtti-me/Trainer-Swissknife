import { z } from "zod";
import { reasoningMixin } from "./common";
import { ObjectivesOutputSchema } from "./objectives";
import { AudienceOutputSchema } from "./audience";
import { NeedsOutputSchema } from "./needs";

/**
 * Skill 4：課程大綱設計
 *
 * 把學習目標拆成 N 堂課（對應開班計畫表底部「課程資料 課堂課程代碼/名稱/時數/主講人」表格）。
 * 一個班 = N 堂課。每堂課有自己的時數與類型（講授／實作／討論／案例／專案）。
 *
 * 「課程資料」是整個課程規劃幫手最核心、最重要的產出，因此每一堂課要求：
 *   1. description：100~250 字的完整課程內容描述，像「領域專家在規劃自己課程」那樣寫
 *   2. keyPoints：3~6 條重點 bullet（這堂課會講到的具體子題、概念、步驟）
 *   3. inClassActivity：課中會做的實作 / 演練 / 討論安排（純 lecture 可寫「無，純講授」）
 *   4. studentTakeaway：學員上完這堂課可以帶走什麼具體成果或能力
 */

export const OutlineInputSchema = z.object({
  needs: NeedsOutputSchema,
  audience: AudienceOutputSchema,
  objectives: ObjectivesOutputSchema,
  /** 培訓師偏好的總時數（選填） */
  preferredTotalHours: z.number().optional(),
  /** 既有班搜尋命中的相似班名（給 LLM 命名靈感參考用） */
  similarClassNames: z.array(z.string()).default([]),
});
export type OutlineInput = z.infer<typeof OutlineInputSchema>;

export const OutlineSessionSchema = z.object({
  position: z.number().int().min(1),
  /** 課堂課程名稱（例：「認識 Google AI Studio」） */
  name: z.string(),
  /** 時數（小時，可為 0.5 倍數） */
  hours: z.number().min(0.5),
  /** 課程類型 */
  type: z.enum(["lecture", "exercise", "discussion", "case_study", "project"]),
  /**
   * 完整課程內容描述（100~250 字）。
   * 像「領域專家在規劃自己的課」那樣紮實地寫，不是湊字數的概念性介紹。
   * 必須包含：講什麼主題 → 為什麼這個主題對該對象重要 → 怎麼帶這個主題 → 預期學員的反應與產出。
   */
  description: z.string(),
  /** 這堂課的重點 bullet（3~6 條，每條 8~30 字，是具體的子題／概念／步驟） */
  keyPoints: z.array(z.string()).default([]),
  /** 課中會做的實作／演練／討論安排；純 lecture 可寫「無，純講授」 */
  inClassActivity: z.string().default(""),
  /** 學員上完這堂課帶走什麼具體成果或能力（1~2 句） */
  studentTakeaway: z.string().default(""),
  /** 對應到的學習目標 id（取自 ObjectivesOutput.objectives[].id） */
  linkedObjectiveIds: z.array(z.number().int()).default([]),
});
export type OutlineSession = z.infer<typeof OutlineSessionSchema>;

export const OutlineOutputSchema = z.object({
  /** 最終建議的班名（會直接抄到開班計畫表「主題」欄） */
  finalTopic: z.string(),
  /** 學習路徑文字 — 為什麼這樣排序、由淺入深的邏輯 */
  learningPath: z.string(),
  /** N 堂課明細 */
  sessions: z.array(OutlineSessionSchema).min(1),
  /** 總時數（自動加總，但讓 LLM 自己算過） */
  totalHours: z.number(),
  /** 本課程特色（會放到開班計畫表「課程資源 本課程特色」） */
  courseFeatures: z.array(z.string()).min(2),
  ...reasoningMixin,
});
export type OutlineOutput = z.infer<typeof OutlineOutputSchema>;
