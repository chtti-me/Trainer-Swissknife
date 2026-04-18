/**
 * 【示範帳號／種子資料輔助】
 * 判斷 TIS 導師欄位是否含「黃建豪」（與種子帳號 trainer1 對應）。
 */

/**
 * TIS「導師」／培訓師姓名（mentorName）是否為黃建豪（可含逗號分隔多名，其一為黃建豪即成立）。
 */
export function isLedByHuangJianhao(mentorNameFromTis: string | null | undefined): boolean {
  if (!mentorNameFromTis?.trim()) return false;
  return mentorNameFromTis
    .split(/[,，、]/)
    .map((s) => s.trim())
    .some((n) => n === "黃建豪");
}
