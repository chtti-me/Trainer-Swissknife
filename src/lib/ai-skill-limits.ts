/**
 * AI 技能脈絡「內文」長度上限（全院／個人版本共用）。
 * 獨立檔案、不依賴 Prisma，可供 Client 與 API 共用常數。
 */
export const MAX_AI_SKILL_CONTENT_LENGTH = 200_000;

export function assertSkillContentWithinLimit(content: string): void {
  if (content.length > MAX_AI_SKILL_CONTENT_LENGTH) {
    throw new Error(`技能內容不可超過 ${MAX_AI_SKILL_CONTENT_LENGTH.toLocaleString("zh-TW")} 字元`);
  }
}
