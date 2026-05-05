import type { SkillDef } from "./_base";
import {
  NotificationInputSchema,
  NotificationOutputSchema,
  type NotificationInput,
  type NotificationOutput,
} from "../schemas/notification";

export const notificationSkill: SkillDef<NotificationInput, NotificationOutput> = {
  name: "notification",
  inputSchema: NotificationInputSchema,
  outputSchema: NotificationOutputSchema,
  temperature: 0.4,
  systemPrompt: `# Skill：課前通知

你的任務是產出開班前發給學員的 Email / LINE 通知文字。

工作要點：
1. **subject**：信件主旨（適合 Email），例如「【課程通知】Vibe Coding 初體驗班 開課提醒」。
2. **body**：完整通知內文，包含：
   - 課程名稱
   - 上課時間（用 [日期] / [時段] 預留欄讓培訓師填）
   - 上課方式（線上 / 實體 / 混成）+ 連結或地點
   - 課前準備（軟體安裝、檔案下載、需要攜帶物品）
   - 簽到方式
   - 注意事項
   - 發信者（中華電信學院）+ 聯絡方式預留欄
3. **checklistBeforeClass**：學員課前該完成的事，3~6 條條列。`,

  buildUserMessage: (input) => {
    return `## 課程形式
${input.format.primaryFormat}（${input.format.formatRationale}）

## 時程
共 ${input.schedule.recommendedDays} 天，每天 ${input.schedule.hoursPerDay} 小時。
報到時間建議：${input.schedule.suggestedCheckInTime}
結訓時間建議：${input.schedule.suggestedGraduationTime}
是否分散上課：${input.schedule.splitAcrossWeeks ? "是" : "否"}

## 課前準備建議（時程 Skill 提供）
${input.schedule.preCourseTasks.map((t) => `- ${t}`).join("\n")}

請輸出課前通知 JSON。`;
  },
};
