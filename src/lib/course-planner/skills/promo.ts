import type { SkillDef } from "./_base";
import {
  PromoInputSchema,
  PromoOutputSchema,
  type PromoInput,
  type PromoOutput,
} from "../schemas/promo";

export const promoSkill: SkillDef<PromoInput, PromoOutput> = {
  name: "promo",
  inputSchema: PromoInputSchema,
  outputSchema: PromoOutputSchema,
  temperature: 0.6,
  systemPrompt: `# Skill：課程文案

你的任務是產出招生通知 / 課程介紹 / 報名頁的文字內容。
這是「輔助文件」，不直接進開班計畫表，培訓師可以拿去發 EDM 或貼到報名系統。

工作要點：
1. **title（文案標題）**：可以比 outline 班名更行銷（不必加【基礎】等學術前綴）。
2. **shortIntro**：一句 elevator pitch（30 字內），說清楚學員會得到什麼。
3. **fullDescription**：200~400 字課程介紹，包含：
   - 為什麼現在需要這個能力（時代背景、職場需求）
   - 課程設計亮點
   - 學員學完能做到什麼（呼應 endpoint）
4. **benefitBullets**：3~6 條，每條一個學員效益，動詞開頭、具體（例如「能用提示詞在 10 分鐘內產出一份簡報初稿」而非「掌握 AI」）。
5. **callToAction**：報名 CTA 文字，1 句話（例如「立刻報名，搶先一步用 AI 工具加速你的工作」）。
6. 全部用中華電信學院內部公告的口吻——專業、不浮誇、不過度行銷腔。`,

  buildUserMessage: (input) => {
    return `## 班名
${input.outline.finalTopic}

## 學員終點
${input.outline.learningPath}

## 對象
${input.audience.primaryAudience}

## 課程結構
${input.outline.sessions.length} 堂課，總時數 ${input.outline.totalHours} 小時，分 ${input.schedule.recommendedDays} 天上完。

## 課程特色
${input.outline.courseFeatures.map((f) => `- ${f}`).join("\n")}

## 講師策略
${input.instructor.overallStrategy}

請輸出課程文案 JSON。`;
  },
};
