/** 種子與 `db:seed:ai-global` 共用的預設「全院 AI 技能」列。 */
export const DEFAULT_GLOBAL_AI_SKILLS: { slug: string; title: string; sortOrder: number; content: string }[] = [
  {
    slug: "course_planning",
    title: "課程規劃",
    sortOrder: 10,
    content:
      "（請由系統管理員補充）課程規劃時的共通重點、院內流程用語、需避免的字眼、與需求單位溝通時的預設假設等。",
  },
  {
    slug: "planning_modules",
    title: "課程規劃—模組設計",
    sortOrder: 11,
    content:
      "產出 modules（課程模組）時：至少 3 個、最多 6 個，時數總和應等於 totalHours。模組名稱要可直接對應開班計劃表「課程名稱」欄位。第一個模組通常是概論與基礎，中段為核心技術與方法，最後為演練與總結。若含實作，模組名稱應明確標示。",
  },
  {
    slug: "planning_instructors",
    title: "課程規劃—講師推薦",
    sortOrder: 12,
    content:
      "產出 instructors（建議講師）時：至少推薦 2 位、最多 4 位。根據課程主題推薦該領域的知名講師、專家或顧問。expertise 填寫該講師的專長領域。講師推薦僅供參考，必須標註「建議人工查證實際資歷」。不可捏造虛假講師資訊。",
  },
  {
    slug: "instructor_search",
    title: "找師資／授課講師安排",
    sortOrder: 20,
    content:
      "徵詢或推薦講師時：**一律**先 instructor_search（含個人師資人脈、培訓師名冊、歷史講師），再 **web_search** 查公開網路資訊，兩者缺一不可；回覆時區分「系統內」與「網路來源」並附出處。外部資訊須標註需人工查證。其餘院內慣例請由系統管理員補充。",
  },
  {
    slug: "edm",
    title: "EDM／招生推廣文案",
    sortOrder: 30,
    content:
      "（請由系統管理員補充）對外／對內招生語氣、品牌用語、禁用的誇大詞、常見課程類型的敘事角度等。",
  },
  {
    slug: "classroom",
    title: "教室／場地",
    sortOrder: 40,
    content:
      "（請由系統管理員補充）各院所場地稱謂、預約流程關鍵字、與教室建議模組連動時的敘事習慣等。",
  },
  {
    slug: "schedule",
    title: "開班日期與時程",
    sortOrder: 50,
    content:
      "（請由系統管理員補充）排程時需留意的院曆、避開時段、與 TIS／開班計畫表欄位對齊的習慣描述等。",
  },
];
