import type { SkillDef } from "./_base";
import {
  InstructorInputSchema,
  InstructorOutputSchema,
  type InstructorInput,
  type InstructorOutput,
} from "../schemas/instructor";

export const instructorSkill: SkillDef<InstructorInput, InstructorOutput> = {
  name: "instructor",
  inputSchema: InstructorInputSchema,
  outputSchema: InstructorOutputSchema,
  temperature: 0.3,
  systemPrompt: `# Skill：講師媒合

你的任務是為每堂課推薦講師。已經由系統預先抓好 4 來源候選人（個人師資人脈 / 培訓師名冊 / 歷史授課 / 網路），你只需要：

1. **每堂課**從候選人中挑 1 位 primary（主推）+ 0~2 位 alternatives（備選）。
2. **fitReasoning**：每位都要寫 1~2 句話為什麼適合「這堂課（不是這個班）」——要連結到該堂課的內容。
3. **優先順序**：通常 personal > history > trainer > web > ai_recommendation
   - 個人師資人脈是培訓師親自累積的關係，最值得優先推
   - 歷史授課代表已驗證能上這類課
   - 培訓師名冊是 CHT 內部正式講師
   - 網路結果只是線索，必須標註「建議人工查證」
4. **若 4 來源都沒有合適候選人**：可以用 source=ai_recommendation 給一個方向描述（例如「具備 5 年以上 AI 應用經驗的內部資深同仁」），但 name 欄位要寫得像「待覓：具 X 經驗的內部資深同仁」這種讓培訓師知道是 placeholder。
5. **overallStrategy**：1~2 段話總結整體講師策略（內聘為主 / 外聘為主 / 混合，原因）。
6. **不要編造 candidate 資料**：name / email / phone 都必須來自輸入候選人列表，或明確標 placeholder。
7. **webSearchPerformed**：依據輸入判斷——若任何一堂課的 webResults 非空就 true，否則 false。`,

  buildUserMessage: (input) => {
    const sessionsBlock = input.candidatesPerSession
      .map((s) => {
        const fmt = (label: string, list: typeof s.personalContacts) =>
          list.length === 0
            ? `  - ${label}：（無命中）`
            : `  - ${label}：${list
                .map((c) => `${c.name}${c.expertise ? `（${c.expertise}）` : ""}${c.notes ? `[${c.notes}]` : ""}`)
                .join("、")}`;
        return `### 第 ${s.sessionPosition} 堂：${s.sessionName}
${fmt("個人師資人脈", s.personalContacts)}
${fmt("培訓師名冊", s.trainers)}
${fmt("歷史授課紀錄", s.historyInstructors)}
${fmt("網路搜尋", s.webResults)}`;
      })
      .join("\n\n");

    const outlineBlock = input.outline.sessions
      .map((s) => `${s.position}. ${s.name}（${s.hours}h，${s.type}）— ${s.description}`)
      .join("\n");

    return `## 班名
${input.outline.finalTopic}

## 堂課明細
${outlineBlock}

## 4 來源候選人
${sessionsBlock}

請為每堂課挑出主推 + 備選講師，輸出符合 schema 的 JSON。`;
  },
};
