import type { SkillDef } from "./_base";
import {
  AssessmentInputSchema,
  AssessmentOutputSchema,
  type AssessmentInput,
  type AssessmentOutput,
} from "../schemas/assessment";

export const assessmentSkill: SkillDef<AssessmentInput, AssessmentOutput> = {
  name: "assessment",
  inputSchema: AssessmentInputSchema,
  outputSchema: AssessmentOutputSchema,
  temperature: 0.3,
  systemPrompt: `# Skill：課程評量

你的任務是設計如何確認學員真的學會：實作任務 / 作業 / 專案 / 主管觀察表。
這是「輔助文件」，不直接進開班計畫表。

工作要點：
1. **inClassTasks（課中實作任務）**：必填，至少 1 個。
   - 每個任務對應到 1~2 個學習目標（在 reasoning 中註明）
   - evidenceOfLearning：學員交什麼出來證明學會（具體可看到的產出物）
2. **preAssessment**（選填）：課前評估，可以是自評問卷或基準測驗。
   - 若課程是「初體驗班」可省略（剛入門不需要）
3. **postAssessment**（選填）：課後評估，可以是測驗或反思報告。
4. **finalProject**（選填）：結業專案；適合長班、深度應用班。
   - 短班可省略
5. **managerObservationForm**（選填）：主管觀察表；幫助 Level 3 行為改變的追蹤。
   - 若課程目標含工作行為改變才寫
6. 不要為了寫滿欄位編造任務——不適合就 omit。`,

  buildUserMessage: (input) => {
    const objs = input.objectives.objectives
      .map((o) => `${o.id}. ${o.statement}（驗證方式：${o.evidence}）`)
      .join("\n");
    const sessions = input.outline.sessions
      .map((s) => `${s.position}. ${s.name}（${s.type}）`)
      .join("\n");
    return `## 學習目標（必須對應到評量）
${objs}

## 課程結構
${sessions}

請輸出課程評量設計 JSON。`;
  },
};
