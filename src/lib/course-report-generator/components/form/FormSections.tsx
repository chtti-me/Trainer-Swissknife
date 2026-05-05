"use client";

/**
 * 【課程規劃報告產生器 - 制式表單共用區塊】
 *
 * 模板的 renderForm 通常包這些 Section 元件，再套自己的色彩/字型/排版。
 * Section 元件本身只管「資料顯示與編輯」，視覺由 props.palette 與外層的 className 決定。
 */
import * as React from "react";
import type { CourseReport, SessionRow } from "../../types/report";
import type { Palette } from "../../types/template";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { useReportStore } from "../../store/reportStore";
import { useUiStore } from "../../store/uiStore";

interface SectionProps {
  report: CourseReport;
  palette: Palette;
  readOnly?: boolean;
}

/**
 * 共用：Section 標題
 *
 * 註：之前因 html2canvas 對中文字 baseline 有偏下偏差，曾嘗試在 readOnly
 * 模式套不對稱 padding 補償，但效果不夠理想。最終改用 html-to-image
 * 函式庫做匯出（基於 SVG <foreignObject> + 瀏覽器 native render），
 * 文字位置就跟預覽完全一致，不再需要任何補償。padding 維持對稱。
 */
export function SectionTitleBlock({ palette, label, no, readOnly, children }: {
  palette: Palette;
  label: string;
  no?: string;
  readOnly?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 print:break-inside-avoid">
      <div
        className="rounded-md px-3 py-1.5 text-base font-bold"
        style={{ backgroundColor: palette.primary, color: palette.primaryFg }}
      >
        {no ? `${no}、${label}` : label}
      </div>
      {!readOnly && children}
    </div>
  );
}

/**
 * Header：標題 + 副標 + 報告人 + 日期
 *
 * 編輯模式版面（按使用者要求重排）：
 *   Row 1: [大標題 (約 70%)]              [日期 (約 30%)]
 *   Row 2: [副標題 (flex-1)] [學系 (短)] [報告人 (flex-1)]
 *   - 日期改放在 Row 1 右側，不佔 Row 2 空間
 *   - 「類型」欄位已整體移除（資料模型也不再有 kind）
 *   - 「學系」縮短至原本一半，省下空間平均分給「副標題」與「報告人」
 */
export function HeaderSection({ report, palette, readOnly }: SectionProps) {
  const setTitle = useReportStore((s) => s.setTitle);
  const setSubtitle = useReportStore((s) => s.setSubtitle);
  const setReporter = useReportStore((s) => s.setReporter);
  const setDepartment = useReportStore((s) => s.setDepartment);
  const setReportDate = useReportStore((s) => s.setReportDate);

  if (readOnly) {
    return (
      <header className="mb-6">
        <h1
          className="mb-1 text-3xl font-extrabold leading-tight"
          style={{ color: palette.primary }}
        >
          {report.title || "（未命名課程規劃報告）"}
        </h1>
        {report.subtitle && (
          <p className="text-base text-muted-foreground" style={{ color: palette.accent }}>
            {report.subtitle}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground" style={{ color: palette.ink }}>
          {report.department && <span>學系：<strong>{report.department}</strong></span>}
          {report.reporter && <span>報告人：<strong>{report.reporter}</strong></span>}
          {report.reportDate && (
            <span>日期：<strong>{new Date(report.reportDate).toLocaleDateString("zh-TW")}</strong></span>
          )}
        </div>
      </header>
    );
  }

  // 編輯模式：所有 input 都套 palette 色彩，確保「紙張色」上看得到字
  // （不能直接吃 dark mode 的 bg-card / bg-background，會變成黑底）
  const inputStyle: React.CSSProperties = {
    backgroundColor: palette.paper,
    color: palette.ink,
    borderColor: palette.border,
  };
  const labelStyle: React.CSSProperties = { color: palette.ink, opacity: 0.7 };

  return (
    <header
      className="mb-6 space-y-3 rounded-lg border p-4 shadow-sm"
      style={{
        backgroundColor: palette.paper,
        borderColor: palette.border,
        color: palette.ink,
      }}
    >
      {/*
        Row 1：大標題（flex 7）+ 日期（flex 1，且最少 220px）。
        改 flex 比例後，日期欄位會拿到更多寬度，足夠容納 native 日曆按鈕，
        不會再出現按鈕右半邊被截掉的情形。
      */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-[7]">
          <label className="mb-1 block text-xs font-semibold" style={labelStyle}>大標題（課程名稱）</label>
          <Input
            value={report.title}
            placeholder="例：2026 年資訊學系 AI 應用培訓系列"
            onChange={(e) => setTitle(e.target.value)}
            className="text-lg font-bold"
            style={inputStyle}
          />
        </div>
        <div className="min-w-[220px] flex-[1] shrink-0">
          <label className="mb-1 block text-xs font-semibold" style={labelStyle}>日期</label>
          <Input
            type="date"
            value={report.reportDate ? report.reportDate.slice(0, 10) : ""}
            onChange={(e) => {
              const date = e.target.value ? new Date(e.target.value).toISOString() : new Date().toISOString();
              setReportDate(date);
            }}
            // 不要把右側 padding 加太大，讓 native 日曆 icon 完整顯示
            className="pr-2"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Row 2：副標題 (flex-1) + 學系 (w-24, 縮半) + 報告人 (flex-1) */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-semibold" style={labelStyle}>副標題（選填）</label>
          <Input
            value={report.subtitle ?? ""}
            placeholder="例：第二季成果與下半年規劃"
            onChange={(e) => setSubtitle(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div className="w-24 shrink-0">
          <label className="mb-1 block text-xs font-semibold" style={labelStyle}>學系</label>
          <Input
            value={report.department ?? ""}
            placeholder="例：資訊學系"
            onChange={(e) => setDepartment(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-semibold" style={labelStyle}>報告人</label>
          <Input
            value={report.reporter}
            placeholder="例：黃建豪"
            onChange={(e) => setReporter(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>
    </header>
  );
}

/** 案由與目的 */
export function PurposeSection({ report, palette, readOnly }: SectionProps) {
  const setPurpose = useReportStore((s) => s.setPurpose);

  return (
    <section className="mb-5 print:break-inside-avoid">
      <SectionTitleBlock palette={palette} no="壹" label="案由與目的" readOnly={readOnly} />
      {readOnly ? (
        <div
          className="whitespace-pre-wrap rounded-md border p-4 text-base leading-relaxed"
          style={{ backgroundColor: palette.paper, color: palette.ink, borderColor: palette.border }}
        >
          {report.purpose || "（請於右上「AI 解析」按鈕產生案由內容，或在此手動填寫）"}
        </div>
      ) : (
        <ContextEditableTextarea
          value={report.purpose}
          onChange={setPurpose}
          placeholder="說明本課程的案由（為什麼要辦）、目的與想達成的目標。可從上傳的開班計畫表自動萃取。"
          minRows={4}
          palette={palette}
          contextField="purpose"
        />
      )}
    </section>
  );
}

/** 課程規劃（含表格） */
export function DesignSection({ report, palette, readOnly }: SectionProps) {
  const setDesignSummary = useReportStore((s) => s.setDesignSummary);
  const addSession = useReportStore((s) => s.addSession);

  return (
    <section className="mb-5 print:break-inside-avoid">
      <SectionTitleBlock palette={palette} no="貳" label="課程規劃" readOnly={readOnly} />

      {readOnly ? (
        <>
          {report.design.summary && (
            <div
              className="mb-3 whitespace-pre-wrap rounded-md border p-4 text-base leading-relaxed"
              style={{ backgroundColor: palette.paper, color: palette.ink, borderColor: palette.border }}
            >
              {report.design.summary}
            </div>
          )}
          <SessionsTable report={report} palette={palette} readOnly />
        </>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold" style={{ color: palette.ink, opacity: 0.7 }}>
              課程說明（簡短前言）
            </label>
            <ContextEditableTextarea
              value={report.design.summary}
              onChange={setDesignSummary}
              placeholder="例：本系列課程針對資訊學系培訓師需求，分為三梯次安排，從基礎到實務逐步深入..."
              minRows={3}
              palette={palette}
              contextField="design.summary"
            />
          </div>
          <SessionsTable report={report} palette={palette} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => addSession()}
            className="gap-1"
            style={{
              backgroundColor: palette.primary,
              color: palette.primaryFg,
              borderColor: palette.primary,
            }}
          >
            <Plus className="h-3.5 w-3.5" /> 新增一節課程
          </Button>
        </div>
      )}
    </section>
  );
}

/** 課程節次表格 */
function SessionsTable({ report, palette, readOnly }: SectionProps) {
  const updateSession = useReportStore((s) => s.updateSession);
  const removeSession = useReportStore((s) => s.removeSession);
  const sessions = report.design.sessions;

  if (sessions.length === 0) {
    return (
      <div
        className="rounded-md border border-dashed p-6 text-center text-sm"
        style={{ borderColor: palette.border, color: palette.ink, opacity: 0.7, backgroundColor: palette.paper }}
      >
        {readOnly ? "（尚無課程節次資料）" : "尚未新增任何節次。可上傳開班計畫表後讓 AI 自動產生，或按下方「新增一節課程」。"}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table
        className="w-full border-collapse text-sm"
        style={{ color: palette.ink }}
      >
        <thead>
          <tr style={{ backgroundColor: palette.tableHeaderBg, color: palette.tableHeaderFg }}>
            {/*
              日期 / 時間 拓寬，配合 native picker 與「09:00–12:00」格式完整顯示。
              亮點欄位給 minWidth=200，避免在 5 欄混排時被擠成 placeholder 都看不全的窄條。
              表頭文字一律 text-center（與 DOCX 結構化匯出對齊；視覺重心也比較像課表）。
            */}
            <th className="border px-2 py-2 text-center text-xs" style={{ borderColor: palette.tableBorder, width: 130 }}>日期</th>
            <th className="border px-2 py-2 text-center text-xs" style={{ borderColor: palette.tableBorder, width: 170 }}>時間</th>
            <th className="border px-2 py-2 text-center text-xs" style={{ borderColor: palette.tableBorder }}>課程主題</th>
            <th className="border px-2 py-2 text-center text-xs" style={{ borderColor: palette.tableBorder, width: 120 }}>講師</th>
            <th className="border px-2 py-2 text-center text-xs" style={{ borderColor: palette.tableBorder, minWidth: 200 }}>亮點</th>
            {!readOnly && <th className="border px-2 py-2" style={{ borderColor: palette.tableBorder, width: 40 }}></th>}
          </tr>
        </thead>
        <tbody>
          {sessions.map((row) => (
            <SessionRowEditor
              key={row.id}
              row={row}
              palette={palette}
              readOnly={readOnly}
              onChange={(p) => updateSession(row.id, p)}
              onRemove={() => removeSession(row.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────── 日期 / 時間格式工具 ───────────────────────────
//
// data layer 仍維持 string：
//   - SessionRow.date: ISO「YYYY-MM-DD」（給 input type="date" 直接用）
//   - SessionRow.timeRange: 「HH:MM–HH:MM」字串（兩個 time picker 拼起來）
// 為相容舊資料（"2026/05/12"、單一時間或缺破折號），把所有解析寫成寬鬆型，
// 解析失敗就回傳空字串而不是丟例外，避免一個 row 壞掉整個畫面。

const DASH = "–"; // U+2013 EN DASH

/** 把任意日期字串轉成 input[type=date] 接受的 "YYYY-MM-DD"，失敗回空字串 */
function toIsoDate(raw: string): string {
  if (!raw) return "";
  // 已是 ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // 斜線格式：YYYY/MM/DD 或 YYYY/M/D
  const m = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) {
    const y = m[1];
    const mo = m[2].padStart(2, "0");
    const d = m[3].padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  // 試 Date.parse
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  }
  return "";
}

/** 把 "HH:MM–HH:MM" 拆出開始 / 結束兩個 "HH:MM"；解析不出來就回空字串 */
function splitTimeRange(raw: string): { start: string; end: string } {
  if (!raw) return { start: "", end: "" };
  // 各種可能的破折號：– — - ~ to
  const parts = raw.split(/\s*[–—\-~]\s*|\s*to\s*/i).filter(Boolean);
  const start = normalizeHHMM(parts[0] ?? "");
  const end = normalizeHHMM(parts[1] ?? "");
  return { start, end };
}

/** 把 "9", "9:00", "09:00", "9:0" 等正規化為 "HH:MM"；非法回空字串 */
function normalizeHHMM(s: string): string {
  if (!s) return "";
  const m = s.trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return "";
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2] ?? "0", 10)));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** 兩個 time 拼回 "HH:MM–HH:MM"；其中一個空就只回另一個；都空回空字串 */
function joinTimeRange(start: string, end: string): string {
  const a = normalizeHHMM(start);
  const b = normalizeHHMM(end);
  if (a && b) return `${a}${DASH}${b}`;
  return a || b;
}

function SessionRowEditor({
  row,
  palette,
  readOnly,
  onChange,
  onRemove,
}: {
  row: SessionRow;
  palette: Palette;
  readOnly?: boolean;
  onChange: (p: Partial<SessionRow>) => void;
  onRemove: () => void;
}) {
  const cellStyle: React.CSSProperties = {
    borderColor: palette.tableBorder,
    backgroundColor: palette.paper,
    color: palette.ink,
  };
  // 編輯模式下，input 一律走 palette 配色，避免 dark mode 下黑底黑字看不見
  const inputStyle: React.CSSProperties = {
    backgroundColor: palette.paper,
    color: palette.ink,
    borderColor: palette.tableBorder,
  };
  if (readOnly) {
    // readOnly 顯示日期：盡量轉成中文 "YYYY/MM/DD"
    const dateDisplay = (() => {
      const iso = toIsoDate(row.date);
      if (!iso) return row.date || "—";
      try {
        return new Date(iso).toLocaleDateString("zh-TW");
      } catch {
        return iso;
      }
    })();
    return (
      <tr>
        <td className="border px-2 py-2 align-top text-xs" style={cellStyle}>{dateDisplay}</td>
        <td className="border px-2 py-2 align-top text-xs" style={cellStyle}>{row.timeRange || "—"}</td>
        <td className="border px-2 py-2 align-top" style={cellStyle}>
          <div className="font-medium">{row.topic || "—"}</div>
          {row.hours && <div className="text-xs opacity-70">{row.hours} 小時</div>}
        </td>
        <td className="border px-2 py-2 align-top" style={cellStyle}>{row.instructor || "—"}</td>
        <td className="border px-2 py-2 align-top whitespace-pre-wrap" style={cellStyle}>{row.highlights || "—"}</td>
      </tr>
    );
  }

  const isoDate = toIsoDate(row.date);
  const { start: startTime, end: endTime } = splitTimeRange(row.timeRange);

  return (
    <tr>
      <td className="border p-1 align-top" style={cellStyle}>
        {/* 日期改用原生 date picker；text-[11px] 確保 "2026-05-21 📅" 都塞得下 */}
        <Input
          type="date"
          value={isoDate}
          onChange={(e) => onChange({ date: e.target.value })}
          className="h-8 px-1 text-[11px]"
          style={inputStyle}
        />
      </td>
      <td className="border p-1 align-top" style={cellStyle}>
        {/*
          時間：兩個原生 time picker，中間放破折號顯示，data 仍存 "HH:MM–HH:MM" 字串。
          step=900（15 分鐘）讓使用者點 picker 上下箭頭時，分鐘以 00/15/30/45 為單位跳動。
          注意：HTML 規範下手動輸入仍可填非 step 倍數的值，瀏覽器只會標 :invalid，
          所以「預設 09:10、16:20」這類非 15 倍數的值仍能保留。
        */}
        <div className="flex items-center gap-0.5">
          <Input
            type="time"
            value={startTime}
            step={900}
            onChange={(e) => onChange({ timeRange: joinTimeRange(e.target.value, endTime) })}
            className="h-8 px-0.5 text-[11px]"
            style={inputStyle}
            aria-label="開始時間"
          />
          <span className="px-0.5 text-[10px] opacity-60">{DASH}</span>
          <Input
            type="time"
            value={endTime}
            step={900}
            onChange={(e) => onChange({ timeRange: joinTimeRange(startTime, e.target.value) })}
            className="h-8 px-0.5 text-[11px]"
            style={inputStyle}
            aria-label="結束時間"
          />
        </div>
      </td>
      <td className="border p-1 align-top" style={cellStyle}>
        <Input
          value={row.topic}
          placeholder="課程主題"
          onChange={(e) => onChange({ topic: e.target.value })}
          className="h-8 text-xs"
          style={inputStyle}
        />
        {/* 場地欄位已移除，僅保留時數 */}
        <div className="mt-1">
          <Input
            value={row.hours ?? ""}
            placeholder="時數"
            onChange={(e) => onChange({ hours: e.target.value })}
            className="h-7 w-full text-xs"
            style={inputStyle}
          />
        </div>
      </td>
      <td className="border p-1 align-top" style={cellStyle}>
        <Input
          value={row.instructor}
          placeholder="講師姓名"
          onChange={(e) => onChange({ instructor: e.target.value })}
          className="h-8 text-xs"
          style={inputStyle}
        />
      </td>
      <td className="border p-1 align-top" style={cellStyle}>
        {/*
          minRows=5、minWidth=160：placeholder「例：實作演練佔 60%、可現場提問、
          邀請業界專家分享...」共 ~25 個中英字，至少要 5 行 / 6 中文字寬才能整段看清，
          否則會出現如使用者反應的「縮在右側看不到」問題。
        */}
        <ContextEditableTextarea
          value={row.highlights}
          onChange={(v) => onChange({ highlights: v })}
          placeholder="例：實作演練佔 60%、可現場提問、邀請業界專家分享..."
          minRows={5}
          minWidth={160}
          palette={palette}
          contextField={`session.${row.id}.highlights`}
          compact
        />
      </td>
      <td className="border p-1 align-top text-center" style={cellStyle}>
        <Button variant="ghost" size="sm" onClick={onRemove} className="h-7 w-7 p-0" title="刪除此節">
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </td>
    </tr>
  );
}

/** 效益（條列） */
export function BenefitsSection({ report, palette, readOnly }: SectionProps) {
  const setBenefits = useReportStore((s) => s.setBenefits);

  if (readOnly) {
    return (
      <section className="mb-5 print:break-inside-avoid">
        <SectionTitleBlock palette={palette} no="參" label="預期效益" readOnly />
        {report.benefits.length === 0 ? (
          <div
            className="rounded-md border p-4 text-sm text-muted-foreground"
            style={{ borderColor: palette.border, backgroundColor: palette.paper }}
          >
            （尚無效益描述）
          </div>
        ) : (
          <ul
            className="rounded-md border p-4 pl-6"
            style={{ borderColor: palette.border, backgroundColor: palette.paper, color: palette.ink }}
          >
            {report.benefits.map((b, i) => (
              <li key={i} className="mb-1.5 list-disc text-base leading-relaxed">{b}</li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  const items = report.benefits.length > 0 ? report.benefits : [""];

  return (
    <section className="mb-5">
      <SectionTitleBlock palette={palette} no="參" label="預期效益">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setBenefits([...items, ""])}
          className="gap-1"
          style={{
            backgroundColor: palette.primary,
            color: palette.primaryFg,
            borderColor: palette.primary,
          }}
        >
          <Plus className="h-3.5 w-3.5" /> 新增一項
        </Button>
      </SectionTitleBlock>
      <div className="space-y-2">
        {items.map((b, i) => (
          <div key={i} className="flex items-start gap-2">
            <span
              className="mt-2 h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: palette.accent }}
            />
            <ContextEditableTextarea
              value={b}
              onChange={(v) => {
                const next = [...items];
                next[i] = v;
                setBenefits(next);
              }}
              placeholder={`效益第 ${i + 1} 項，例：可協助公司提升 OO 流程效率約 30%，預估年度節省 OO 工時。`}
              minRows={2}
              palette={palette}
              contextField={`benefit.${i}`}
              compact
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const next = items.filter((_, idx) => idx !== i);
                setBenefits(next.length > 0 ? next : [""]);
              }}
              className="h-7 w-7 p-0"
              title="刪除此項"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Textarea 包裝：右鍵時會把選取片段送給 ContextMenu，讓 AI 動作可以在制式表單模式也能用。
 * 同時支援「行高調整」：minRows=N。
 */
function ContextEditableTextarea({
  value,
  onChange,
  placeholder,
  minRows = 3,
  minWidth,
  palette,
  contextField,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;
  /** 最小寬度（px），用於塞在表格 cell 內又想保證 placeholder 能呈現的情形 */
  minWidth?: number;
  palette: Palette;
  contextField: string;
  compact?: boolean;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const openContextMenu = useUiStore((s) => s.openContextMenu);

  const handleContext = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const sel = el.value.substring(el.selectionStart ?? 0, el.selectionEnd ?? 0);
    // 沒選取則用整段；至少有些文字 AI 才有著力點
    const text = sel.trim() || el.value.trim();
    if (!text) return;
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, {
      kind: "text",
      selectionText: text,
      blockId: null,
    });
    // 紀錄這個 textarea，讓 ContextMenu 的 handler 在執行 optimize-text 時可以替換內容
    (window as unknown as { __courseReportLastTextarea?: HTMLTextAreaElement }).__courseReportLastTextarea = el;
    (window as unknown as { __courseReportLastTextareaField?: string }).__courseReportLastTextareaField = contextField;
    (window as unknown as { __courseReportLastTextareaSetter?: (v: string) => void }).__courseReportLastTextareaSetter = onChange;
  };

  return (
    <Textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onContextMenu={handleContext}
      placeholder={placeholder}
      rows={minRows}
      style={{
        backgroundColor: palette.paper,
        color: palette.ink,
        borderColor: palette.border,
        fontSize: compact ? 12 : 14,
        minWidth: minWidth ? `${minWidth}px` : undefined,
      }}
      className="resize-y"
    />
  );
}
