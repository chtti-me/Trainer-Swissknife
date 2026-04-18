/**
 * 【教室預約建議表單選項】
 * 教室性質代碼、設備關鍵字、所別、時間刻度等，供畫面勾選／下拉用。
 * 比喻：點餐時的「套餐配料表」——顯示中文，後台仍傳 TIS 認得的代碼。
 */
export const CLASSROOM_TYPE_OPTIONS = [
  { value: "1", label: "一般教室", hint: "代碼 1" },
  { value: "2", label: "電腦教室", hint: "代碼 2" },
  { value: "3", label: "會議／研討室", hint: "代碼 3" },
  { value: "4", label: "遠距／直播專用", hint: "代碼 4" },
  { value: "5", label: "多功能教室", hint: "代碼 5" },
  { value: "6", label: "實作／實驗型", hint: "代碼 6" },
] as const;

/** 設備關鍵字（feature keywords），供評分與篩選邏輯使用；顯示給使用者選。 */
export const FEATURE_OPTIONS = [
  { value: "projector", label: "投影機", hint: "projector" },
  { value: "mic", label: "麥克風", hint: "mic" },
  { value: "vc", label: "視訊會議", hint: "vc" },
  { value: "whiteboard", label: "電子白板", hint: "whiteboard" },
  { value: "recording", label: "錄影／錄音", hint: "recording" },
] as const;

export const DEPARTMENT_OPTIONS = [
  { value: "P", label: "院本部", hint: "P" },
  { value: "T", label: "台中所", hint: "T" },
  { value: "K", label: "高雄所", hint: "K" },
  { value: "E", label: "全 e 課程", hint: "E" },
] as const;

/** 產生 08:00–21:45、每 15 分鐘一筆的時間字串（HH:mm）。 */
export function buildQuarterHourTimeOptions(): string[] {
  const out: string[] = [];
  for (let h = 8; h <= 21; h++) {
    for (const m of [0, 15, 30, 45]) {
      if (h === 21 && m > 0) break;
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
}
