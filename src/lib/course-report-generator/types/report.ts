/**
 * 【課程規劃報告產生器 - 資料模型】
 *
 * 整份報告以 CourseReport 表示，包含：
 *   - 制式欄位（title / purpose / design / benefits）：可在「制式表單模式」下直接編輯
 *   - canvas 元素清單：可在「自由畫布模式」下拖曳/縮放/插入
 *   - 模板與配色：影響兩種模式的視覺呈現
 *   - 上傳檔案的元數據（Blob 本身存在 IndexedDB，這裡只記 id/檔名/類型）
 */

/** 報告的兩種編輯模式 */
export type ReportMode = "form" | "canvas";

/** 課程規劃中的單一節次（表格列） */
export interface SessionRow {
  id: string;
  /** ISO 格式 YYYY-MM-DD（給 input type="date" 用） */
  date: string;
  /** 例：09:00–12:00（內部以 "HH:MM–HH:MM" 字串儲存） */
  timeRange: string;
  /** 課程主題 / 子題 */
  topic: string;
  /** 講師姓名（可多人，用「、」分隔） */
  instructor: string;
  /** 亮點（多行文字） */
  highlights: string;
  /** 時數（小時，未填可空字串） */
  hours?: string;
}

/** 課程規劃區塊（含表格） */
export interface CourseDesign {
  /** 文字說明（簡短前言） */
  summary: string;
  /** 節次表格 */
  sessions: SessionRow[];
}

/** 文字方塊樣式 */
export interface TextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: string;
  color?: string;
  backgroundColor?: string;
  textAlign?: "left" | "center" | "right" | "justify";
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number;
  padding?: number;
  lineHeight?: number;
  zIndex?: number;
}

/** 表格樣式 */
export interface TableStyle {
  fontFamily?: string;
  fontSize?: number;
  headerBg?: string;
  headerColor?: string;
  cellBg?: string;
  cellColor?: string;
  borderColor?: string;
  borderWidth?: number;
  zIndex?: number;
}

/** 圖表規格（給 ChartBlock 用） */
export interface ChartSpec {
  type: "bar" | "line" | "pie" | "doughnut";
  title?: string;
  labels: string[];
  datasets: { label: string; data: number[] }[];
  /** 渲染為 PNG 後的 dataURL（避免 export 時依賴運行時環境） */
  pngDataUrl?: string;
}

/** 自由畫布的元素種類 */
export type CanvasBlock =
  | {
      kind: "text";
      id: string;
      x: number;
      y: number;
      w: number;
      h: number;
      /** contentEditable 的 HTML（簡化標籤） */
      html: string;
      style: TextStyle;
    }
  | {
      kind: "image";
      id: string;
      x: number;
      y: number;
      w: number;
      h: number;
      src: string; // dataURL 或 IDB blob URL
      alt?: string;
      borderRadius?: number;
      zIndex?: number;
    }
  | {
      kind: "table";
      id: string;
      x: number;
      y: number;
      w: number;
      h: number;
      rows: string[][];
      style: TableStyle;
      /** 是否第一列為表頭 */
      hasHeader?: boolean;
      /**
       * 各欄寬度（像素，畫布座標系）。
       * undefined 或長度與欄數不符時，會 fallback 為「等寬平均分配」，
       * 因此舊有資料 / AI 自動產生的表格不需要改動就能正常顯示。
       */
      colWidths?: number[];
    }
  | {
      kind: "chart";
      id: string;
      x: number;
      y: number;
      w: number;
      h: number;
      spec: ChartSpec;
    };

/** 上傳檔案的元數據（Blob 不存這裡） */
export interface UploadedFileMeta {
  id: string; // 內部 id，作為 IDB key 的一部分
  name: string;
  type: string; // MIME
  size: number;
  ext: string; // png/jpg/pdf/docx/html/txt
  /** server 回傳的純文字（OCR 後 / 文件解析後），用於 AI 提示 */
  extractedText?: string;
  /** 上傳時間 ISO */
  uploadedAt: string;
}

/** 整份報告的最終資料模型 */
export interface CourseReport {
  schemaVersion: 1;
  /** 大標題（通常是課程名稱） */
  title: string;
  /** 副標題 */
  subtitle?: string;
  /** 培訓師姓名 */
  reporter: string;
  /** 學系 */
  department?: string;
  /** 報告日期 ISO */
  reportDate: string;
  /** 案由與目的 */
  purpose: string;
  /** 課程規劃 */
  design: CourseDesign;
  /** 效益（條列） */
  benefits: string[];
  /** 編輯模式 */
  mode: ReportMode;
  /** 模板 ID */
  templateId: string;
  /** 配色 ID */
  paletteId: string;
  /** 自由畫布元素（mode='canvas' 時主要使用，但 mode='form' 也可作為附加層） */
  canvas: CanvasBlock[];
  /** 上傳檔案元數據 */
  uploads: UploadedFileMeta[];
  /** 使用者額外輸入的純文字筆記 */
  notes?: string;
  /** TIS URL（已抓取後的） */
  tisUrl?: string;
  /** 草稿更新時間 */
  updatedAt: string;
}

/** AI 從上傳資料抽取後回傳的部分欄位（僅 form 結構欄位） */
export interface AiExtractedReport {
  title?: string;
  purpose?: string;
  designSummary?: string;
  sessions?: Array<Partial<SessionRow>>;
  benefits?: string[];
  /** AI 對整體報告的補充說明 / 警示（顯示給使用者看） */
  notes?: string;
}
