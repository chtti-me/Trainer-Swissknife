import type { SkillDef } from "./_base";
import {
  ScheduleInputSchema,
  ScheduleOutputSchema,
  type ScheduleInput,
  type ScheduleOutput,
} from "../schemas/schedule";

export const scheduleSkill: SkillDef<ScheduleInput, ScheduleOutput> = {
  name: "schedule",
  inputSchema: ScheduleInputSchema,
  outputSchema: ScheduleOutputSchema,
  temperature: 0.3,
  systemPrompt: `# Skill：課程時程規劃

你的任務是建議天數、單日時數、節奏與課前/課後追蹤節點。
**不要**指定具體日期（培訓師手動填），只給「幾天 × 每天幾小時」的具體建議。

工作要點：
1. **recommendedDays / hoursPerDay / totalHours**：
   - totalHours 應與 outline.totalHours 一致；若有差異 reasoning 中說明
   - 若 outline.totalHours = 8 → 建議 1 天 8 小時 或 2 天每天 4 小時，依形式選擇判斷
   - hoursPerDay 範圍 1.0 ~ 8.0
2. **splitAcrossWeeks**：是否跨週／不連續上課？
   - 在職進修 + 線上同步多採「分多天每天 2-3 小時」 → splitAcrossWeeks=true
   - 一日體驗班 / 工作坊 → splitAcrossWeeks=false
3. **suggestedCheckInTime / suggestedGraduationTime**：HH:mm 格式
   - 全日班：09:00 / 17:00 為主
   - 半日班：09:30 / 12:00 或 13:30 / 17:00
   - 線上直播：可以晚 10 分鐘 09:20 / 11:30
4. **periodsToAvoid**：列出應避開的時段
   - 月底前一週（結帳）、季末（KPI 結算）、年度規劃會議期、長假前後
5. **preCourseTasks**：課前準備（培訓師端 + 學員端條列）
6. **postCourseCheckpoints**：課後追蹤節點（例如「結訓後 1 週收回實作作品」「結訓後 30 天主管觀察回饋」）`,

  buildUserMessage: (input) => {
    const sessionsLine = input.outline.sessions
      .map((s) => `${s.position}. ${s.name}（${s.hours}h）`)
      .join(" → ");
    const formatLine = `${input.format.primaryFormat}（${input.format.formatRationale}）`;
    const pref = input.preferredDays ? `\n\n## 培訓師偏好天數：${input.preferredDays} 天` : "";

    return `## 班名
${input.outline.finalTopic}

## 總時數
${input.outline.totalHours} 小時

## 堂課順序
${sessionsLine}

## 課程形式
${formatLine}（教學方法：${input.format.teachingMethods.join("、")}）${pref}

請輸出時程規劃 JSON。`;
  },
};
