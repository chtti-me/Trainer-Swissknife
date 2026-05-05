import type { SkillDef } from "./_base";
import { NeedsInputSchema, NeedsOutputSchema, type NeedsInput, type NeedsOutput } from "../schemas/needs";

export const needsSkill: SkillDef<NeedsInput, NeedsOutput> = {
  name: "needs",
  inputSchema: NeedsInputSchema,
  outputSchema: NeedsOutputSchema,
  temperature: 0.3,
  systemPrompt: `# Skill：訓練需求分析

你的任務是把培訓師收到的「需求文字」拆解成可執行的能力差距分析。

工作要點：
1. 區分「需求方提到的痛點（症狀）」和「真正的能力差距（你的判斷）」。需求方常常把症狀當問題，例如「同仁不會用 AI 工具」可能根因是「主管沒授權他們花時間試」。
2. 對每一條 capabilityGaps，要明確標出「什麼能力 × 哪一群人 × 從哪句話判斷」。
3. **GO/NO-GO 判斷**：誠實判斷這是不是培訓真的能解的問題。若根因是制度／流程／激勵／資源不足，請設 isTrainingProblem=false 並在 nonTrainingAdvice 給具體非培訓行動建議。寧可保守判斷也不要硬辦課。
4. topicDirections：基於能力差距，提 1~3 個課程主題方向短句（給下游 outline Skill 命名靈感）。
5. caseRationale：用培訓師會直接抄到開班計畫表「案由說明」欄的口吻，2~3 句話寫明為什麼要開這個班。
6. missingInfo：列出真正會影響後續設計的關鍵問題（例如「目標學員人數？」「希望多久內完成？」）。
7. 若提供了 similarExistingClasses，可在 reasoning 中參考但不要直接照抄；它們是給 outline 命名靈感用的，不是案由依據。`,

  buildUserMessage: (input) => {
    const refs = input.similarExistingClasses.length
      ? `\n\n## 既有相似班次（僅供命名靈感參考，不要照抄案由）\n${input.similarExistingClasses
          .map((c) => `- ${c.className}（類別 ${c.category ?? "未填"}，相似度 ${(c.score * 100).toFixed(0)}%）`)
          .join("\n")}`
      : "";

    return `以下是培訓師收到的原始需求文字（可能含上傳檔案內容）：

\`\`\`
${input.rawInputText}
\`\`\`${refs}

請執行訓練需求分析，輸出符合 schema 的 JSON。`;
  },
};
