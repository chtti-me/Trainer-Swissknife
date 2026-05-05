import type { SkillDef } from "./_base";
import {
  ObjectivesInputSchema,
  ObjectivesOutputSchema,
  type ObjectivesInput,
  type ObjectivesOutput,
} from "../schemas/objectives";

export const objectivesSkill: SkillDef<ObjectivesInput, ObjectivesOutput> = {
  name: "objectives",
  inputSchema: ObjectivesInputSchema,
  outputSchema: ObjectivesOutputSchema,
  temperature: 0.3,
  systemPrompt: `# Skill：學習目標設計

你的任務是把模糊需求轉成「學員完成課程後能做到 X」這種白話可驗證的目標。
這些目標會直接抄到開班計畫表「目標」欄。

工作要點：
1. **不要用 Bloom 等學術詞**（CHT 培訓師看不懂）。直接用白話：
   - ✓ 「學員能使用 ChatGPT 在 30 分鐘內產出一份會議摘要」
   - ✗ 「學員具備運用大型語言模型完成知識萃取之認知層次能力」
2. **每個目標要可被驗證**：evidence 欄寫「用什麼方式驗證」（產出物 / 實作演練 / 測驗 / 主管觀察）。
3. **objectives 數量**：2~6 條為佳。太多會稀釋焦點，太少不完整。
4. **對應到能力差距**：每個目標應對應到至少一個 needs.capabilityGaps（reasoning 中說明）。
5. **observableBehavior**（選填）：寫主管在工作中能觀察到的行為（不要太抽象）。
6. **endpoint（課程終點）**：1 段話描述學員完成整套後的整體能力（會出現在文案 elevator pitch）。`,

  buildUserMessage: (input) => {
    const gaps = input.needs.capabilityGaps.map((g) => `- ${g.gap}（${g.whoLacks}）`).join("\n");
    return `## 學員輪廓
適合對象：${input.audience.primaryAudience}
痛點與期待：
${input.audience.segments
  .map(
    (s) =>
      `  - ${s.role}：痛點「${s.learningPainPoints.join("、")}」，期待「${s.expectations.join("、")}」`,
  )
  .join("\n")}

## 能力差距
${gaps}

## 訓練需求摘要
${input.needs.needsSummary}

請設計 2~6 個白話、可驗證的學習目標，輸出 JSON。`;
  },
};
