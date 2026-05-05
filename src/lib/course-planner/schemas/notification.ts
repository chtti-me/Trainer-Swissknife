import { z } from "zod";
import { reasoningMixin } from "./common";
import { ScheduleOutputSchema } from "./schedule";
import { FormatOutputSchema } from "./format";

/**
 * Skill 9：課前通知
 *
 * 開班前發給學員的 Email / LINE 通知文字。
 *
 * 註：「學員課前提問設定」屬於中華電信學院的開班 meta data，不在本 Skill 職責內。
 */

export const NotificationInputSchema = z.object({
  schedule: ScheduleOutputSchema,
  format: FormatOutputSchema,
});
export type NotificationInput = z.infer<typeof NotificationInputSchema>;

export const NotificationOutputSchema = z.object({
  /** Email / LINE 主旨 */
  subject: z.string(),
  /** 完整通知內文 */
  body: z.string(),
  /** 學員課前該完成的事 */
  checklistBeforeClass: z.array(z.string()),
  ...reasoningMixin,
});
export type NotificationOutput = z.infer<typeof NotificationOutputSchema>;
