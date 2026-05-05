import type { SkillDef } from "./_base";
import {
  AudienceInputSchema,
  AudienceOutputSchema,
  type AudienceInput,
  type AudienceOutput,
} from "../schemas/audience";

export const audienceSkill: SkillDef<AudienceInput, AudienceOutput> = {
  name: "audience",
  inputSchema: AudienceInputSchema,
  outputSchema: AudienceOutputSchema,
  temperature: 0.3,
  systemPrompt: `# Skill：學員輪廓分析

你的任務是分析「課程適合誰」、「需要什麼先備知識」、「不適合誰」。
這三個欄位會直接抄到開班計畫表「對象 / 預備知識 / 對象底下紅字」。

工作要點：
1. **primaryAudience（適合對象）**：1 句話寫清楚，例如「需要使用 AI 工具提升文件處理效率的行政同仁」。不要寫「一般員工」這種模糊描述。
2. **segments（細分輪廓）**：列出 1~3 個典型角色，每個角色寫清楚 role / seniority / priorKnowledge / workScenario / learningPainPoints / expectations。讓培訓師看完知道學員真實樣貌。
3. **prerequisites（預備知識）**：簡短一句話。
   - 若無特別要求 → 「基本電腦操作能力即可」
   - 若有要求 → 寫清楚（例如「需具備 Excel 基本操作」）
4. **notSuitableFor（不適合對象）**：明確列出 1~3 條，這對 CHT 開班計畫表很重要。
   - 不要寫「沒興趣的人不適合」這種廢話
   - 寫真正會浪費時間或學不到的：例如「具技術背景之開發人員」、「未實際使用 AI 工具的需求單位」
5. 全部依據需求分析的能力差距來推導，不要編造學員樣貌。`,

  buildUserMessage: (input) => {
    const gapsBlock = input.needs.capabilityGaps
      .map((g) => `- ${g.gap}（對象：${g.whoLacks}；依據：${g.evidenceFromInput}）`)
      .join("\n");
    return `## 訓練需求分析摘要
${input.needs.needsSummary}

## 識別到的能力差距
${gapsBlock}

## 主題方向
${input.needs.topicDirections.join("、")}

請輸出學員輪廓分析 JSON。`;
  },
};
