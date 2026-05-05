import type { SkillDef } from "./_base";
import {
  MaterialsInputSchema,
  MaterialsOutputSchema,
  type MaterialsInput,
  type MaterialsOutput,
} from "../schemas/materials";

export const materialsSkill: SkillDef<MaterialsInput, MaterialsOutput> = {
  name: "materials",
  inputSchema: MaterialsInputSchema,
  outputSchema: MaterialsOutputSchema,
  temperature: 0.4,
  systemPrompt: `# Skill：教材資源

你的任務是規劃這個班需要的教材：投影片 / 講義 / 範例檔 / 練習資料；以及「課前 / 課中 / 課後」三段教學特色。
後者會直接抄到開班計畫表「課程資源 課前/課中/課後」欄。

工作要點：
1. **slides**：每堂課對應 1 個主投影片條目（name + purpose）；不必到「每張投影片」這麼細。
2. **handouts**：講義；通常 1~3 個（總綱、重點摘要、自學包）。
3. **examples**：範例檔；通常給實作課用（程式碼、範本、樣本資料）。
4. **exercises**：練習資料；課中或課後練習用。
5. 不要編造具體 URL／檔名；name 寫類別性的（例如「【週 1】認識 AI 工具 投影片」），purpose 寫用途。
6. **preClassFeatures（課前特色）**：1~3 條，例如「課前提供 AI 工具註冊指引」「需先看 30 分鐘短片」（若有）。
7. **inClassFeatures（課中特色）**：1~5 條，例如「實作為主：每堂課都含實際範例與練習」「以 AI 驅動開發」。對應圖中的「本課程特色」段。
8. **postClassFeatures（課後特色）**：1~3 條，例如「結訓後 1 週收回實作作品供主管參閱」「提供範例專案延伸學習資源」。`,

  buildUserMessage: (input) => {
    const sessions = input.outline.sessions
      .map((s) => `${s.position}. ${s.name}（${s.type}, ${s.hours}h）— ${s.description}`)
      .join("\n");
    return `## 班名
${input.outline.finalTopic}

## 學習路徑
${input.outline.learningPath}

## 堂課明細
${sessions}

## 已有的課程特色
${input.outline.courseFeatures.map((f) => `- ${f}`).join("\n")}

請輸出教材資源規劃 JSON（含三段教學特色，與已有課程特色可呼應、不必完全重複）。`;
  },
};
