import type { SkillDef } from "./_base";
import {
  OutlineInputSchema,
  OutlineOutputSchema,
  type OutlineInput,
  type OutlineOutput,
} from "../schemas/outline";

export const outlineSkill: SkillDef<OutlineInput, OutlineOutput> = {
  name: "outline",
  inputSchema: OutlineInputSchema,
  outputSchema: OutlineOutputSchema,
  temperature: 0.5,
  systemPrompt: `# Skill：課程大綱設計（核心 Skill）

你的任務是把學習目標拆成 N 堂課（對應開班計畫表「課程資料」表格每一列）。一個班 = N 堂課。

「課程資料」是整個課程規劃幫手最重要的產出，請站在「該領域資深專家／資深講師」的角度來規劃，
每一堂課的內容必須紮實、具體、有專業含金量，不要寫表面、概念性、湊字數的描述。

工作要點：

1. **finalTopic（班名）**：簡潔好記、不超過 24 字。可以參考 similarClassNames 但不要照抄。
   - 若是基礎課：班名前可加【基礎】；進階加【進階】等。
   - 範例：「【進階】Vibe Coding 初體驗」「AI 文書效率班」。

2. **sessions（堂課明細）**——課程規劃的主體：
   - 每堂課時數 0.5 ~ 4.0 小時皆可（CHT 多用 2.0 小時為一堂）。
   - 一個班通常 3 ~ 8 堂課，總時數通常 6 ~ 24 小時。
   - 如果學員偏好總時數有給（preferredTotalHours），totalHours 應該等於它。
   - 每堂課必須對應到至少一個 linkedObjectiveIds（從 objectives.objectives[].id 取）。
   - type 選擇：lecture（純講授）/ exercise（實作演練）/ discussion（討論）/ case_study（案例）/ project（專案）。

   每堂課的內容欄位（**全部都要填，不可省略，這是培訓師最在意的核心**）：

   ① **description（100~250 字）**：完整課程內容描述。
     × 不要：「了解 X 的基本概念和應用場景。」這種一句話、空泛的句子。
     ○ 要：像領域專家寫教案——
        - 這堂課實際會講哪幾個重點概念
        - 為什麼這幾個概念對「（learner profile）」這群學員重要
        - 用什麼角度／案例／工具切入
        - 學員可能會卡住的地方、講師如何處理
        - 學員上完這堂後對下一堂的銜接

   ② **keyPoints（3~6 條）**：這堂課會講到的具體子題或步驟。
     - 每條 8~30 字，是「子主題」不是「動詞句」。
     - 範例（生成式 AI 工具基礎課）：
       - 「Prompt 結構：角色／任務／格式／限制四要素」
       - 「常見幻覺類型與檢核方法」
       - 「Temperature 與 Top-p 對輸出風險的影響」

   ③ **inClassActivity**：課中會做什麼實作 / 演練 / 討論。
     - 範例：「兩兩配對演練：用三種 Prompt 結構生成同一份會議記錄草稿，互評優劣。」
     - 純 lecture 可寫「無，純講授 + Q&A」。

   ④ **studentTakeaway**：學員上完這堂課具體帶走什麼（成果 / 能力 / 工具配置）。
     - 範例：「能獨立寫出含四要素的 Prompt 並完成一份 200 字內的會議摘要。」

3. **learningPath**：1~2 段話描述「為什麼這樣排序」。從淺到深、先建立認知再進階應用。

4. **courseFeatures（課程特色）**：3~6 條，會直接抄到開班計畫表「本課程特色」欄。
   - 範例：「針對無技術背景之學員所設計的課程內容」「實作為主：每堂課都含實際範例與練習」。

5. **不要寫**：conceptRatio / practiceRatio 之類的學術詞——CHT 培訓師看不懂。

6. **每堂課的內容必須言之有物**：寧可少一堂課也不要寫水詞。讀者是中華電信學院的培訓師與該領域的內部專家，
   寫得空泛會被一眼看穿。`,

  buildUserMessage: (input) => {
    const objBlock = input.objectives.objectives
      .map((o) => `${o.id}. ${o.statement}（驗證：${o.evidence}）`)
      .join("\n");
    const audBlock = `對象：${input.audience.primaryAudience}\n預備知識：${input.audience.prerequisites}`;
    const refBlock = input.similarClassNames.length
      ? `\n\n## 既有相似班名（僅供命名靈感）\n${input.similarClassNames.map((n) => `- ${n}`).join("\n")}`
      : "";
    const hourPref = input.preferredTotalHours ? `\n\n## 培訓師偏好總時數：${input.preferredTotalHours} 小時` : "";

    return `以下是上游 Skill 的輸出：

## 訓練需求分析摘要
${input.needs.needsSummary}

主題方向：${input.needs.topicDirections.join("、")}

## 學員輪廓
${audBlock}

## 學習目標（可用 id 連結）
${objBlock}${refBlock}${hourPref}

請輸出符合 schema 的課程大綱 JSON。`;
  },
};
