/** 種子與 `db:seed:ai-global` 共用的預設「全院 AI 技能」列。 */
export const DEFAULT_GLOBAL_AI_SKILLS: { slug: string; title: string; sortOrder: number; content: string }[] = [
  {
    slug: "course_planning",
    title: "課程規劃",
    sortOrder: 10,
    content:
      "「課程規劃幫手」最終產物是一份開班計畫表草案。請以中華電信學院培訓師立場思考，避免 ADDIE / Bloom / Kirkpatrick 等學術詞——培訓師看不懂；改用務實白話。\n\n所有 Skill 的輸出都必須附帶 reasoning（為什麼這樣判斷）、assumptions（補完的假設）、confidence（自評信心 0~1），讓培訓師能驗證 AI 的推理依據。\n\n若需求方提到的痛點背後根因不是培訓能解決的（制度／流程／激勵／資源），需 Skill needs 設 isTrainingProblem=false 並建議非培訓行動，寧可保守也不要硬辦課。",
  },
  {
    slug: "planning_skill_needs",
    title: "課程規劃—訓練需求分析",
    sortOrder: 11,
    content:
      "Skill 1 訓練需求分析：區分「需求方提到的痛點（症狀）」和「真正的能力差距（你的判斷）」。對每條 capabilityGaps 必須標出「什麼能力 × 哪一群人 × 從哪句話判斷」。caseRationale 要寫成可直接抄到開班計畫表「案由說明」欄的 2~3 句話。",
  },
  {
    slug: "planning_skill_audience",
    title: "課程規劃—學員輪廓分析",
    sortOrder: 12,
    content:
      "Skill 2 學員輪廓分析：primaryAudience 一句話寫清楚（不要「一般員工」這種模糊詞）；notSuitableFor 必須明確（例如「具技術背景之開發人員」），這是開班計畫表對象框內紅字區，不寫廢話。",
  },
  {
    slug: "planning_skill_objectives",
    title: "課程規劃—學習目標設計",
    sortOrder: 13,
    content:
      "Skill 3 學習目標設計：用「學員完成課程後能做到 X」白話格式。每個目標附 evidence 寫如何驗證學會。2~6 條為佳。不要 Bloom 分類學詞彙。",
  },
  {
    slug: "planning_skill_outline",
    title: "課程規劃—課程大綱（堂課拆分）",
    sortOrder: 14,
    content:
      "Skill 4 課程大綱：一個班 = N 堂課（對應開班計畫表底部表格）。每堂課時數 0.5~4 小時、CHT 多以 2 小時為一堂。3~8 堂課、總時數 6~24 小時為常見區間。每堂課以 type 列舉表示性質：lecture/exercise/discussion/case_study/project。班代號由培訓師手動填，AI 不參與。",
  },
  {
    slug: "planning_skill_format",
    title: "課程規劃—課程形式選擇",
    sortOrder: 15,
    content:
      "Skill 5 課程形式：填入開班計畫表「開班性質」13 個小欄位中 AI 能判斷的部分。報到地點寫法：純直播「選擇直播上課學員請於辦公場所連線上課，不需至學院」；實體「請至中華電信學院 [院本部/台中所/高雄所] 報到」（樓層教室由培訓師手動）。",
  },
  {
    slug: "planning_skill_instructor",
    title: "課程規劃—講師媒合",
    sortOrder: 16,
    content:
      "Skill 6 講師媒合：4 來源預先抓好（個人師資人脈 / 培訓師名冊 / 歷史授課 / 網路）。每堂課挑主推 1 + 備選 0~2 位。優先順序通常 personal > history > trainer > web > ai_recommendation。每位 fitReasoning 要連結到「這堂課」（不是這個班）。網路結果註記「建議人工查證」。不可捏造姓名／聯絡資料。",
  },
  {
    slug: "planning_skill_schedule",
    title: "課程規劃—時程規劃",
    sortOrder: 17,
    content:
      "Skill 7 時程規劃：給「幾天 × 每天幾小時」具體建議，不指定具體日期（培訓師手動）。在職進修 + 線上多採分多天每天 2-3 小時。應避開時段：月底前一週、季末、年度規劃會議期、長假前後。",
  },
  {
    slug: "planning_skill_aux",
    title: "課程規劃—輔助文件（promo/notification/materials/assessment）",
    sortOrder: 18,
    content:
      "Skill 8~11 輔助文件不進開班計畫表但會獨立呈現可下載：\n- promo（課程文案）：title 可比班名行銷一些；fullDescription 200~400 字；benefitBullets 動詞開頭。\n- notification（課前通知）：CHT 多數班次預設 acceptPreQuestions=false，原因照官方範本。\n- materials（教材資源）：規劃投影片/講義/範例/練習；同時填入課前/課中/課後三段教學特色。\n- assessment（課程評量）：每個 inClassTask 必填 evidenceOfLearning。短班可省略 finalProject／preAssessment。",
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
