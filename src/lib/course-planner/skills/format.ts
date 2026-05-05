import type { SkillDef } from "./_base";
import {
  FormatInputSchema,
  FormatOutputSchema,
  type FormatInput,
  type FormatOutput,
} from "../schemas/format";

export const formatSkill: SkillDef<FormatInput, FormatOutput> = {
  name: "format",
  inputSchema: FormatInputSchema,
  outputSchema: FormatOutputSchema,
  temperature: 0.3,
  systemPrompt: `# Skill：課程形式選擇

你的任務是決定這個班用什麼形式上、用什麼教學方法／工具平台。

工作要點：
1. **primaryFormat（主要形式）**：依據學員特性與內容選一種
   - in_person：實體課堂；適合需要實作互動 + 學員都在同地點
   - online_live：線上同步直播；適合分散在各分公司
   - online_async：線上非同步（錄播）；適合人數多、自學節奏
   - hybrid：混成；前半線上、後半實體；或部分學員線上、部分實體
   - workshop：工作坊；半日 ~ 全日，重產出
   - self_paced：自學課程
2. **formatRationale**：用 1~2 句話說明為什麼選這種形式（給下游 schedule / promo Skill 參考）。
3. **teachingMethods（教學方法）**：列 3~6 個（互動演練／講授／案例討論／小組討論／實機操作／…）
4. **toolsAndPlatforms**：實體用的（教室、白板、投影機）；線上用的（Zoom/Teams/Webex）。

注意：「對象範圍對內／對外」「是否半天班」「報到地點說明」等屬於中華電信學院的開班 meta data，
不在本 Skill 職責內，培訓師會於開班計畫表上自行設定。`,

  buildUserMessage: (input) => {
    const aud = `${input.audience.primaryAudience}（細分：${input.audience.segments
      .map((s) => `${s.role}/${s.workScenario}`)
      .join("、")}）`;
    const sessTypes = Array.from(new Set(input.outline.sessions.map((s) => s.type))).join("、");
    return `## 學員輪廓
${aud}

## 課程大綱
班名：${input.outline.finalTopic}
總時數：${input.outline.totalHours} 小時
堂數：${input.outline.sessions.length}
堂課類型分佈：${sessTypes}

請輸出課程形式選擇 JSON。`;
  },
};
