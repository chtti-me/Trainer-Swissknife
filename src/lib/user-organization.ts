/**
 * 【培訓師單位與院所別對照】
 * 下拉選單選項、以及「單位 → 院本部／台中／高雄」自動帶入邏輯。
 * 比喻：人事系統裡的「部門代碼表」。
 */
export const TRAINER_UNITS = [
  "資訊學系",
  "企管學系",
  "網路學系",
  "台中所",
  "高雄所",
] as const;

export type TrainerUnit = (typeof TRAINER_UNITS)[number];

/** 依單位帶入 `campus`（院所別）欄位 */
export function campusFromTrainerUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  if (unit === "台中所" || unit === "高雄所") return unit;
  if (unit === "資訊學系" || unit === "企管學系" || unit === "網路學系") return "院本部";
  return null;
}

export const USER_ROLES = [
  { value: "trainer", label: "培訓師" },
  { value: "admin", label: "系統管理員" },
] as const;
