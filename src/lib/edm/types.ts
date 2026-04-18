/**
 * 【EDM 產生器型別】
 * 描述「課程資訊、版型、欄位選項」等資料結構，讓 parser 與 HTML 模板共用同一份定義。
 */
export type EdmTone = "professional" | "friendly" | "enthusiastic" | "formal";

export interface ParsedCourseItem {
  code: string;
  name: string;
  lectureHours?: number;
  practiceHours?: number;
  instructor?: string;
}

export interface ParsedClassInfo {
  classId?: string;
  className?: string;
  periodCode?: string;
  system?: string;
  days?: number;
  hours?: number;
  trainerName?: string;
  trainerPhone?: string;
  trainerEmail?: string;
  goal?: string;
  audience?: string;
  prerequisites?: string;
  startDate?: string;
  endDate?: string;
  /** 上課／授課起迄時段（例如 09:00～17:00），與報到時間不同時優先顯示此欄 */
  sessionTimeRange?: string;
  checkinTime?: string;
  location?: string;
  classroom?: string;
  registrationUrl?: string;
  estimatedTraineeCount?: number;
  courseItems: ParsedCourseItem[];
  rawText: string;
}

export interface ParsedFieldOption {
  key:
    | "className"
    | "classId"
    | "startDate"
    | "registrationUrl"
    | "trainer"
    | "hours"
    | "location"
    | "goal"
    | "audience"
    | "prerequisites"
    | "courseItems"
    | "estimatedTraineeCount";
  label: string;
  checked: boolean;
  value?: string;
}

export interface ThemePalette {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface EdmImageItem {
  id: string;
  name: string;
  dataUrl: string;
}

export interface EdmGenerateRequest {
  parsed: ParsedClassInfo;
  selectedFieldKeys: ParsedFieldOption["key"][];
  templateId: string;
  paletteId: string;
  customPrompt: string;
  tone: EdmTone;
  images: EdmImageItem[];
}

export interface EdmTemplateInput {
  parsed: ParsedClassInfo;
  selectedFieldKeys: ParsedFieldOption["key"][];
  palette: ThemePalette;
  headline: string;
  /** 副標／一句話賣點，置於主標下方 */
  subheadline: string;
  bodyHtml: string;
  images: EdmImageItem[];
}

export interface EdmTemplate {
  id: string;
  name: string;
  description: string;
  render: (input: EdmTemplateInput) => string;
}

export interface EdmGenerateResponse {
  mode: "ai" | "demo";
  headline: string;
  subheadline: string;
  bodyHtml: string;
  finalHtml: string;
}
