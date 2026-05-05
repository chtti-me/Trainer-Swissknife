import { z } from "zod";

/**
 * 開班計畫表（中華電信學院）— 完整 schema
 *
 * 設計原則：「課程規劃幫手」聚焦在課程規劃本身能解決的問題；
 * 中華電信學院特有的 meta data（體系別、ESG 分類、培訓構面、轉型課程類別、
 * 報到地點說明、案由類別、教室名稱、開班性質、學員課前提問設定…）
 * 已從 schema 中移除——那些欄位由培訓師依學院規定另外設定，
 * 不在課程規劃幫手的職責範圍內。
 */

// ---------- AI 填的欄位 ----------

export const SessionItemSchema = z.object({
  position: z.number().int().min(1).describe("第幾堂課，從 1 開始"),
  name: z.string().describe("課程名稱，例如「認識 Google AI Studio」"),
  hours: z.number().min(0.5).describe("時數（小時，可為 0.5 倍數）"),
  type: z
    .enum(["lecture", "exercise", "discussion", "case_study", "project"])
    .describe("課程類型：講授／實作／討論／案例／專案"),
  /** 完整內容描述（100~250 字，由 outline Skill 產出，可由培訓師編輯） */
  description: z.string().describe("這堂課做什麼、學員產出"),
  /** 這堂課的重點 bullet（3~6 條） */
  keyPoints: z.array(z.string()).default([]).describe("重點 bullet"),
  /** 課中會做的實作 / 演練 / 討論 */
  inClassActivity: z.string().default("").describe("課中活動安排"),
  /** 學員帶走什麼成果或能力 */
  studentTakeaway: z.string().default("").describe("學員帶走的具體成果"),
  linkedObjectiveIds: z.array(z.number().int()).default([]).describe("對應到學習目標的 id"),
  primaryInstructorName: z.string().optional().describe("主推講師姓名（可由培訓師覆蓋）"),
  alternativeInstructorNames: z.array(z.string()).default([]).describe("備選講師姓名"),
});
export type SessionItem = z.infer<typeof SessionItemSchema>;

export const AiFilledSchema = z.object({
  /** 主題（圖：頂部「主題」框；班名） */
  topic: z.string().describe("最終班名 / 主題"),

  /** 目標（圖：左中「目標」） */
  objectives: z.array(z.string()).describe("多 bullet，每條一個學習目標"),

  /** 對象（圖：中「對象」） */
  audience: z.string().describe("適合報名的對象描述"),

  /** 對象底下的「不適合」紅字段（圖：對象框內紅色字） */
  notSuitableFor: z.array(z.string()).default([]).describe("不適合報名的對象條列"),

  /** 預備知識（圖：右上「預備知識」） */
  prerequisites: z.string().describe("學員需要先具備的知識"),

  /** 課程資源（圖：「課程資源 課前/課中/課後」三欄；本課程特色條列） */
  courseFeatures: z.array(z.string()).describe("本課程特色，對應圖內條列：課程內容、AI 驅動開發、實作為主、職場導向、漸進式學習等"),

  /** 課程資料／課程大綱（圖：底部表格） */
  sessions: z.array(SessionItemSchema).min(1).describe("課堂明細：N 堂課"),

  /** 案由說明（圖：「專案開班案由 案由說明」） */
  caseRationale: z.string().describe("為什麼要開這個班的案由說明"),
});
export type AiFilled = z.infer<typeof AiFilledSchema>;

// ---------- 培訓師手動的欄位 ----------

export const ManualFieldsSchema = z.object({
  /**
   * 9 碼開班代號 = 5 碼班代號 + 1 碼開班地點 + 3 碼期別。
   *   - 班代號：例如 CR25A
   *   - 開班地點：P=板橋院本部 / T=台中所 / K=高雄所 / E=全 E 課程（elearning）
   *   - 期別：001、002、003…
   * 例：CR24AP002 = CR24A 板橋院本部 第 2 期。
   */
  classCode: z.string().optional(),
  /** 是否使用個案教學法 */
  useCaseMethod: z.boolean().default(false),
  /** 是否適用「學以致用提報計畫獎」 */
  eligibleForApplyAward: z.boolean().default(false),
  /** 是否考證輔導班 */
  certificationCounseling: z.boolean().default(false),
  /** 期間（多個日期，YYYY-MM-DD） */
  classDates: z.array(z.string()).default([]),
  /** 報到時間 / 結訓時間（HH:mm） */
  checkInTime: z.string().optional(),
  graduationTime: z.string().optional(),
  /** 預調人數各分公司 */
  expectedAttendees: z
    .object({
      chtMain: z.number().int().default(0),
      personalFamily: z.number().int().default(0),
      enterprise: z.number().int().default(0),
      international: z.number().int().default(0),
      networkCom: z.number().int().default(0),
      itDivision: z.number().int().default(0),
      researchInstitute: z.number().int().default(0),
      external: z.number().int().default(0),
    })
    .default({
      chtMain: 0,
      personalFamily: 0,
      enterprise: 0,
      international: 0,
      networkCom: 0,
      itDivision: 0,
      researchInstitute: 0,
      external: 0,
    }),
  /** 佐證資料 */
  supportingDocs: z.string().optional(),
});
export type ManualFields = z.infer<typeof ManualFieldsSchema>;

// ---------- 開班計畫表整體 ----------

export const CoursePlanFormSchema = z.object({
  aiFilled: AiFilledSchema,
  manual: ManualFieldsSchema,
});
export type CoursePlanForm = z.infer<typeof CoursePlanFormSchema>;

/**
 * 4 份輔助文件（不進開班計畫表，但會在 UI 獨立呈現 + 可下載）。
 */
export const AuxiliaryDocsSchema = z.object({
  promo: z
    .object({
      title: z.string(),
      shortIntro: z.string(),
      fullDescription: z.string(),
      benefitBullets: z.array(z.string()),
      callToAction: z.string(),
    })
    .nullable()
    .default(null),
  notification: z
    .object({
      subject: z.string(),
      body: z.string(),
      checklistBeforeClass: z.array(z.string()),
    })
    .nullable()
    .default(null),
  materials: z
    .object({
      slides: z.array(z.object({ name: z.string(), purpose: z.string() })),
      handouts: z.array(z.object({ name: z.string(), purpose: z.string() })),
      examples: z.array(z.object({ name: z.string(), purpose: z.string() })),
      exercises: z.array(z.object({ name: z.string(), purpose: z.string() })),
    })
    .nullable()
    .default(null),
  assessment: z
    .object({
      preAssessment: z.string().optional(),
      inClassTasks: z.array(
        z.object({ name: z.string(), description: z.string(), evidenceOfLearning: z.string() }),
      ),
      postAssessment: z.string().optional(),
      finalProject: z.string().optional(),
      managerObservationForm: z.string().optional(),
    })
    .nullable()
    .default(null),
});
export type AuxiliaryDocs = z.infer<typeof AuxiliaryDocsSchema>;

/**
 * 建立預設的空 form（剛建 request 時用）。
 */
export function emptyCoursePlanForm(): CoursePlanForm {
  return {
    aiFilled: {
      topic: "",
      objectives: [],
      audience: "",
      notSuitableFor: [],
      prerequisites: "",
      courseFeatures: [],
      sessions: [],
      caseRationale: "",
    },
    manual: ManualFieldsSchema.parse({}),
  };
}

export function emptyAuxiliaryDocs(): AuxiliaryDocs {
  return { promo: null, notification: null, materials: null, assessment: null };
}
