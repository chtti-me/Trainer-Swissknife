/**
 * 【課程規劃報告產生器 - 報告主 store（zustand）】
 *
 * 管理整份 CourseReport 的狀態：
 *   - 表單欄位（title / purpose / design / benefits）
 *   - 自由畫布元素清單（canvas）
 *   - 模板與配色 ID
 *   - 上傳檔案的元數據（Blob 由 idb.ts 管理）
 *   - undo / redo 歷史
 *
 * 不在這個 store 處理：autosave 寫入 IDB（由 useAutosave hook 訂閱本 store 後寫）。
 */
"use client";

import { create } from "zustand";
import type {
  CanvasBlock,
  CourseReport,
  ReportMode,
  SessionRow,
  TableStyle,
  TextStyle,
  UploadedFileMeta,
} from "../types/report";
import { newId, nowIso } from "../lib/utils";

const HISTORY_LIMIT = 50;

/** 建立空白報告（給新使用者第一次進入時） */
export function createEmptyReport(reporter = "", department = ""): CourseReport {
  return {
    schemaVersion: 1,
    title: "",
    subtitle: "",
    reporter,
    department,
    reportDate: nowIso(),
    purpose: "",
    design: { summary: "", sessions: [] },
    benefits: [],
    mode: "form",
    templateId: "modern-card",
    paletteId: "navy-white",
    canvas: [],
    uploads: [],
    notes: "",
    tisUrl: "",
    updatedAt: nowIso(),
  };
}

interface ReportSnapshot {
  report: CourseReport;
}

interface ReportStore {
  report: CourseReport;
  /** 是否從 IDB 草稿還原完成（避免還沒還原就被 autosave 蓋掉） */
  hydrated: boolean;
  past: ReportSnapshot[];
  future: ReportSnapshot[];

  /** 一次性 hydrate（從 IDB 載入草稿，或設成空白） */
  hydrate: (report: CourseReport) => void;
  reset: (report?: CourseReport) => void;

  /** 表單欄位 patch（淺 merge） */
  patch: (p: Partial<CourseReport>) => void;
  setTitle: (s: string) => void;
  setSubtitle: (s: string) => void;
  setReporter: (s: string) => void;
  setDepartment: (s: string) => void;
  setReportDate: (iso: string) => void;
  setPurpose: (s: string) => void;
  setDesignSummary: (s: string) => void;
  setBenefits: (b: string[]) => void;
  setMode: (m: ReportMode) => void;
  setTemplateId: (id: string) => void;
  setPaletteId: (id: string) => void;
  setNotes: (s: string) => void;
  setTisUrl: (s: string) => void;

  /** 課程節次 */
  addSession: (row?: Partial<SessionRow>) => void;
  updateSession: (id: string, p: Partial<SessionRow>) => void;
  removeSession: (id: string) => void;
  reorderSessions: (orderedIds: string[]) => void;

  /** 自由畫布 blocks */
  addBlock: (block: CanvasBlock) => void;
  updateBlock: (id: string, patch: Partial<CanvasBlock>) => void;
  removeBlock: (id: string) => void;
  setCanvas: (blocks: CanvasBlock[]) => void;

  /** 上傳檔案 */
  addUpload: (m: UploadedFileMeta) => void;
  removeUpload: (id: string) => void;
  updateUpload: (id: string, p: Partial<UploadedFileMeta>) => void;
  clearUploads: () => void;

  /** 從 AI extract 結果 hydrate 到表單欄位（不覆蓋使用者已填的欄位） */
  applyAiExtract: (
    extract: {
      title?: string;
      purpose?: string;
      designSummary?: string;
      sessions?: Array<Partial<SessionRow>>;
      benefits?: string[];
      notes?: string;
    },
    options?: { overwriteAll?: boolean }
  ) => void;

  /** undo / redo */
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

function pushHistory(state: ReportStore): ReportSnapshot[] {
  const next = [...state.past, { report: state.report }];
  if (next.length > HISTORY_LIMIT) next.shift();
  return next;
}

/**
 * 大部分 setter 都會把 `previous report` 推進 history（給 undo），
 * 並把 `report.updatedAt` 更新成 now。
 */
function applyMutation(
  set: (fn: (s: ReportStore) => Partial<ReportStore>) => void,
  mutator: (r: CourseReport) => CourseReport
) {
  set((state) => {
    const past = state.hydrated ? pushHistory(state) : state.past;
    const next = mutator(state.report);
    return {
      past,
      future: [],
      report: { ...next, updatedAt: nowIso() },
    };
  });
}

export const useReportStore = create<ReportStore>((set, get) => ({
  report: createEmptyReport(),
  hydrated: false,
  past: [],
  future: [],

  hydrate: (report) =>
    set(() => ({
      report,
      hydrated: true,
      past: [],
      future: [],
    })),

  reset: (report) =>
    set(() => ({
      report: report ?? createEmptyReport(),
      past: [],
      future: [],
      hydrated: true,
    })),

  patch: (p) => applyMutation(set, (r) => ({ ...r, ...p })),

  setTitle: (s) => applyMutation(set, (r) => ({ ...r, title: s })),
  setSubtitle: (s) => applyMutation(set, (r) => ({ ...r, subtitle: s })),
  setReporter: (s) => applyMutation(set, (r) => ({ ...r, reporter: s })),
  setDepartment: (s) => applyMutation(set, (r) => ({ ...r, department: s })),
  setReportDate: (iso) => applyMutation(set, (r) => ({ ...r, reportDate: iso })),
  setPurpose: (s) => applyMutation(set, (r) => ({ ...r, purpose: s })),
  setDesignSummary: (s) =>
    applyMutation(set, (r) => ({ ...r, design: { ...r.design, summary: s } })),
  setBenefits: (b) => applyMutation(set, (r) => ({ ...r, benefits: b })),
  setMode: (m) => applyMutation(set, (r) => ({ ...r, mode: m })),
  setTemplateId: (id) => applyMutation(set, (r) => ({ ...r, templateId: id })),
  setPaletteId: (id) => applyMutation(set, (r) => ({ ...r, paletteId: id })),
  setNotes: (s) => applyMutation(set, (r) => ({ ...r, notes: s })),
  setTisUrl: (s) => applyMutation(set, (r) => ({ ...r, tisUrl: s })),

  addSession: (row) =>
    applyMutation(set, (r) => {
      // 預設時間「09:10–16:20」是中華電信學院多數課程的典型時段（含中午休息），
      // 設成預設值可大幅減少使用者每次新增節次都要重設時間的力氣。
      const sessions = [
        ...r.design.sessions,
        {
          id: newId(),
          date: row?.date ?? "",
          timeRange: row?.timeRange ?? "09:10–16:20",
          topic: row?.topic ?? "",
          instructor: row?.instructor ?? "",
          highlights: row?.highlights ?? "",
          hours: row?.hours ?? "",
        },
      ];
      return { ...r, design: { ...r.design, sessions } };
    }),
  updateSession: (id, p) =>
    applyMutation(set, (r) => ({
      ...r,
      design: {
        ...r.design,
        sessions: r.design.sessions.map((s) => (s.id === id ? { ...s, ...p } : s)),
      },
    })),
  removeSession: (id) =>
    applyMutation(set, (r) => ({
      ...r,
      design: {
        ...r.design,
        sessions: r.design.sessions.filter((s) => s.id !== id),
      },
    })),
  reorderSessions: (orderedIds) =>
    applyMutation(set, (r) => {
      const map = new Map(r.design.sessions.map((s) => [s.id, s]));
      const sessions = orderedIds.map((id) => map.get(id)).filter(Boolean) as SessionRow[];
      // 補回 orderedIds 漏掉的元素
      r.design.sessions.forEach((s) => {
        if (!sessions.find((x) => x.id === s.id)) sessions.push(s);
      });
      return { ...r, design: { ...r.design, sessions } };
    }),

  addBlock: (block) => applyMutation(set, (r) => ({ ...r, canvas: [...r.canvas, block] })),
  updateBlock: (id, patch) =>
    applyMutation(set, (r) => ({
      ...r,
      canvas: r.canvas.map((b) =>
        b.id === id ? ({ ...b, ...patch } as CanvasBlock) : b
      ),
    })),
  removeBlock: (id) =>
    applyMutation(set, (r) => ({
      ...r,
      canvas: r.canvas.filter((b) => b.id !== id),
    })),
  setCanvas: (blocks) => applyMutation(set, (r) => ({ ...r, canvas: blocks })),

  addUpload: (m) =>
    applyMutation(set, (r) => ({
      ...r,
      uploads: [...r.uploads.filter((u) => u.id !== m.id), m],
    })),
  removeUpload: (id) =>
    applyMutation(set, (r) => ({
      ...r,
      uploads: r.uploads.filter((u) => u.id !== id),
    })),
  updateUpload: (id, p) =>
    applyMutation(set, (r) => ({
      ...r,
      uploads: r.uploads.map((u) => (u.id === id ? { ...u, ...p } : u)),
    })),
  clearUploads: () => applyMutation(set, (r) => ({ ...r, uploads: [] })),

  applyAiExtract: (extract, options) =>
    applyMutation(set, (r) => {
      const force = !!options?.overwriteAll;
      const next: CourseReport = { ...r };
      if (extract.title && (force || !r.title)) next.title = extract.title;
      if (extract.purpose && (force || !r.purpose)) next.purpose = extract.purpose;
      if (extract.designSummary && (force || !r.design.summary)) {
        next.design = { ...r.design, summary: extract.designSummary };
      }
      if (Array.isArray(extract.sessions) && extract.sessions.length > 0 && (force || r.design.sessions.length === 0)) {
        const sessions: SessionRow[] = extract.sessions.map((s) => ({
          id: newId(),
          date: s.date ?? "",
          timeRange: s.timeRange ?? "",
          topic: s.topic ?? "",
          instructor: s.instructor ?? "",
          highlights: s.highlights ?? "",
          hours: s.hours ?? "",
        }));
        next.design = { ...next.design, sessions };
      }
      if (Array.isArray(extract.benefits) && extract.benefits.length > 0 && (force || r.benefits.length === 0)) {
        next.benefits = extract.benefits.filter((b) => b && b.trim()).map((b) => b.trim());
      }
      return next;
    }),

  undo: () =>
    set((state) => {
      if (state.past.length === 0) return {};
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, -1);
      return {
        past: newPast,
        future: [{ report: state.report }, ...state.future],
        report: previous.report,
      };
    }),
  redo: () =>
    set((state) => {
      if (state.future.length === 0) return {};
      const [next, ...rest] = state.future;
      return {
        past: [...state.past, { report: state.report }],
        future: rest,
        report: next.report,
      };
    }),
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
}));

/** 預設 text style */
export const defaultTextStyle: TextStyle = {
  fontFamily: "Noto Sans TC, sans-serif",
  fontSize: 16,
  color: "#22263a",
  backgroundColor: "transparent",
  textAlign: "left",
  lineHeight: 1.6,
  padding: 8,
  borderWidth: 0,
  borderColor: "#cccccc",
  borderRadius: 4,
};

/** 預設 table style */
export const defaultTableStyle: TableStyle = {
  fontFamily: "Noto Sans TC, sans-serif",
  fontSize: 14,
  headerBg: "#1f3a8a",
  headerColor: "#ffffff",
  cellBg: "#ffffff",
  cellColor: "#22263a",
  borderColor: "#cbd5e1",
  borderWidth: 1,
};
