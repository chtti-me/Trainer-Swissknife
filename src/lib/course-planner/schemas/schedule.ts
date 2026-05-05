import { z } from "zod";
import { reasoningMixin } from "./common";
import { OutlineOutputSchema } from "./outline";
import { FormatOutputSchema } from "./format";

/**
 * Skill 7：課程時程規劃
 *
 * 建議天數、單日時數、節奏、課前／課中／課後安排。
 * 不指定具體日期（培訓師手動填），但給「幾天 × 每天幾小時」的具體建議。
 */

export const ScheduleInputSchema = z.object({
  outline: OutlineOutputSchema,
  format: FormatOutputSchema,
  /** 培訓師偏好（選填） */
  preferredDays: z.number().optional(),
});
export type ScheduleInput = z.infer<typeof ScheduleInputSchema>;

export const ScheduleOutputSchema = z.object({
  /** 建議天數 */
  recommendedDays: z.number().int().min(1),
  /** 建議每日時數（小時） */
  hoursPerDay: z.number().min(1).max(8),
  /** 總時數（與 outline.totalHours 應該一致；若不一致 reasoning 解釋） */
  totalHours: z.number(),
  /** 是否分段上課（true = 不連續、跨週／跨月） */
  splitAcrossWeeks: z.boolean(),
  /** 節奏建議（每天什麼時段、休息安排） */
  cadenceNote: z.string(),
  /** 報到時間建議（HH:mm） */
  suggestedCheckInTime: z.string(),
  /** 結訓時間建議（HH:mm） */
  suggestedGraduationTime: z.string(),
  /** 課前準備（培訓師端與學員端） */
  preCourseTasks: z.array(z.string()),
  /** 課後追蹤節點 */
  postCourseCheckpoints: z.array(z.string()),
  /** 應避開的時段（例如月底結帳、年度規劃會議） */
  periodsToAvoid: z.array(z.string()),
  ...reasoningMixin,
});
export type ScheduleOutput = z.infer<typeof ScheduleOutputSchema>;
