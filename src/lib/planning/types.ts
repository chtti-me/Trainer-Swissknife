/**
 * 精簡版課程規劃幫手 - 型別定義
 * 只包含開班計劃表必要欄位
 */

/** 課程模組 */
export interface CourseModule {
  name: string;
  hours: number;
}

/** 建議講師 */
export interface InstructorSuggestion {
  name: string;
  expertise: string;
  source: "web_search" | "ai_recommendation";
}

/** AI 產出的課程規劃結果 */
export interface CoursePlanResult {
  suggestedTitle: string;
  objective: string;
  targetAudience: string;
  prerequisites: string;
  totalHours: number;
  modules: CourseModule[];
  instructors: InstructorSuggestion[];
}

/** 使用者輸入的基本資訊（可選調整） */
export interface CoursePlanInput {
  requirementText: string;
  preferredTitle?: string;
  preferredHours?: number;
}

/** 課程規劃頁面狀態 */
export type CoursePlanStep = "input" | "result";

export interface CoursePlanState {
  step: CoursePlanStep;
  input: CoursePlanInput;
  result: CoursePlanResult | null;
  loading: boolean;
  requestId: string | null;
}

/** 建立空的輸入資料 */
export function emptyCoursePlanInput(): CoursePlanInput {
  return {
    requirementText: "",
    preferredTitle: undefined,
    preferredHours: undefined,
  };
}

/** 建立初始頁面狀態 */
export function createCoursePlanState(): CoursePlanState {
  return {
    step: "input",
    input: emptyCoursePlanInput(),
    result: null,
    loading: false,
    requestId: null,
  };
}
