"use client";

/**
 * 開班計畫表（草案）— 表單顯示
 *
 * 設計原則：
 *   1. 不再顯示「培訓師手填」/「AI 填」徽章——資訊密度過高反而干擾。
 *      改為「待填寫」彩色 placeholder：手填欄位空時用琥珀色高亮提醒，填了就消失。
 *   2.「課程資料」區是課程規劃的核心產出，完全不顯示 zone 徽章，純粹呈現資料。
 *   3. 所有「N 堂、共 X 小時」這類 summary 都從 sessions 即時計算，不寫死。
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import type { CoursePlanForm, SessionItem } from "@/lib/course-planner/schemas/form";
import { cn } from "@/lib/utils";

const SESSION_TYPE_LABEL: Record<SessionItem["type"], string> = {
  lecture: "講授",
  exercise: "實作",
  discussion: "討論",
  case_study: "案例",
  project: "專案",
};

/** 一致的小字 label（不再帶 zone 徽章） */
function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-1">
      <Label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
        {label}
      </Label>
      {hint && <span className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</span>}
    </div>
  );
}

/** 手填欄位的 className：空值時彩色高亮提醒「待填寫」，有值時就普通樣式。 */
function manualCls(value: unknown): string {
  const empty =
    value == null ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0);
  return cn(
    "border",
    empty
      ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800/70 placeholder:text-amber-700 dark:placeholder:text-amber-300 focus:ring-amber-300"
      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700",
  );
}

/** AI 欄位用普通樣式（白底） */
const aiCls = "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900";

export interface CoursePlanFormViewProps {
  form: CoursePlanForm;
  onChange: (next: CoursePlanForm) => void;
  readOnly?: boolean;
}

export function CoursePlanFormView({ form, onChange, readOnly }: CoursePlanFormViewProps) {
  const updateAi = <K extends keyof CoursePlanForm["aiFilled"]>(
    key: K,
    value: CoursePlanForm["aiFilled"][K],
  ) => {
    onChange({ ...form, aiFilled: { ...form.aiFilled, [key]: value } });
  };
  const updateSession = (idx: number, patch: Partial<SessionItem>) => {
    const sessions = form.aiFilled.sessions.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    updateAi("sessions", sessions);
  };
  const addSession = () => {
    const sessions = [
      ...form.aiFilled.sessions,
      {
        position: form.aiFilled.sessions.length + 1,
        name: "新堂課",
        hours: 2,
        type: "lecture" as const,
        description: "",
        linkedObjectiveIds: [],
        alternativeInstructorNames: [],
      },
    ];
    updateAi("sessions", sessions);
  };
  const removeSession = (idx: number) => {
    const sessions = form.aiFilled.sessions
      .filter((_, i) => i !== idx)
      .map((s, i) => ({ ...s, position: i + 1 }));
    updateAi("sessions", sessions);
  };

  const updateManual = <K extends keyof CoursePlanForm["manual"]>(
    key: K,
    value: CoursePlanForm["manual"][K],
  ) => {
    onChange({ ...form, manual: { ...form.manual, [key]: value } });
  };

  // 即時計算總時數 / 堂數（不再依賴 schema 上不存在的 recommendedTotalHours）
  const totalHours = form.aiFilled.sessions.reduce((sum, s) => sum + s.hours, 0);
  const sessionCount = form.aiFilled.sessions.length;

  return (
    <Card>
      <CardHeader className="border-b bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-950/40 dark:to-blue-950/40">
        <CardTitle className="text-lg">中華電信學院 開班計畫表（草案）</CardTitle>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          琥珀色高亮的欄位為「待填寫」（培訓師依學院規定補上）；其他由 AI 草擬，可直接內聯編輯覆蓋。
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-6">
        {/* ============ 班名 + 班代號（同一列） ============ */}
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 sm:col-span-6">
            <FieldLabel label="班名" />
            <Input
              value={form.aiFilled.topic}
              onChange={(e) => updateAi("topic", e.target.value)}
              disabled={readOnly}
              className={aiCls}
              placeholder="班名 / 主題"
            />
          </div>
          <div className="col-span-12 sm:col-span-4">
            <FieldLabel label="班代號（9 碼）" />
            <Input
              value={form.manual.classCode || ""}
              onChange={(e) => updateManual("classCode", e.target.value.toUpperCase())}
              disabled={readOnly}
              className={cn(manualCls(form.manual.classCode), "font-mono tracking-wide uppercase")}
              placeholder="待填寫"
              maxLength={9}
            />
            <div className="mt-1 text-[10px] leading-tight text-slate-400 dark:text-slate-500">
              例：CR24AP002（CR24A 班代號 + P 板橋院本部 + 002 期別）
            </div>
            <div className="text-[10px] leading-tight text-slate-400 dark:text-slate-500">
              地點：P 板橋院本部 ｜ T 台中所 ｜ K 高雄所 ｜ E 全 E 課程
            </div>
          </div>
        </div>

        {/* ============ 學習目標 ============ */}
        <div>
          <FieldLabel label="學習目標" />
          <Textarea
            rows={Math.min(8, Math.max(3, form.aiFilled.objectives.length + 1))}
            value={form.aiFilled.objectives.join("\n")}
            onChange={(e) =>
              updateAi(
                "objectives",
                e.target.value.split(/\n/).map((s) => s.trim()).filter(Boolean),
              )
            }
            disabled={readOnly}
            className={aiCls}
            placeholder="一行一個目標"
          />
        </div>

        {/* ============ 對象 + 不適合 + 預備知識 + 課程特色 ============ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <FieldLabel label="對象" />
              <Textarea
                rows={3}
                value={form.aiFilled.audience}
                onChange={(e) => updateAi("audience", e.target.value)}
                disabled={readOnly}
                className={aiCls}
              />
            </div>
            <div>
              <FieldLabel label="不適合報名" hint="紅字區" />
              <Textarea
                rows={3}
                value={form.aiFilled.notSuitableFor.join("\n")}
                onChange={(e) =>
                  updateAi(
                    "notSuitableFor",
                    e.target.value.split(/\n/).map((s) => s.trim()).filter(Boolean),
                  )
                }
                disabled={readOnly}
                className={cn(
                  aiCls,
                  "border-rose-200 text-rose-700 dark:border-rose-900/60 dark:text-rose-300",
                )}
                placeholder="一行一條，例如「具技術背景之開發人員」"
              />
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <FieldLabel label="預備知識" />
              <Textarea
                rows={3}
                value={form.aiFilled.prerequisites}
                onChange={(e) => updateAi("prerequisites", e.target.value)}
                disabled={readOnly}
                className={aiCls}
              />
            </div>
            <div>
              <FieldLabel label="本課程特色" hint="課程資源 課前/課中/課後" />
              <Textarea
                rows={6}
                value={form.aiFilled.courseFeatures.join("\n")}
                onChange={(e) =>
                  updateAi(
                    "courseFeatures",
                    e.target.value.split(/\n/).map((s) => s.trim()).filter(Boolean),
                  )
                }
                disabled={readOnly}
                className={aiCls}
                placeholder="一行一條"
              />
            </div>
          </div>
        </div>

        {/* ============ 案由說明 ============ */}
        <div>
          <FieldLabel label="案由說明" />
          <Textarea
            rows={4}
            value={form.aiFilled.caseRationale}
            onChange={(e) => updateAi("caseRationale", e.target.value)}
            disabled={readOnly}
            className={aiCls}
          />
        </div>

        {/* ============ 課程資料：N 堂課明細（核心產出，不顯示 zone 徽章） ============ */}
        <div>
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2 border-b border-slate-200 dark:border-slate-700 pb-1">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              課程資料
            </h3>
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {sessionCount} 堂　共 {totalHours} 小時
            </div>
          </div>
          <div className="space-y-2">
            {form.aiFilled.sessions.map((s, idx) => (
              <SessionRow
                key={idx}
                session={s}
                onChange={(patch) => updateSession(idx, patch)}
                onRemove={() => removeSession(idx)}
                readOnly={readOnly}
              />
            ))}
            {!readOnly && (
              <button
                type="button"
                onClick={addSession}
                className="inline-flex items-center gap-1 text-sm text-violet-600 dark:text-violet-300 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> 新增一堂課
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface SessionRowProps {
  session: SessionItem;
  onChange: (patch: Partial<SessionItem>) => void;
  onRemove: () => void;
  readOnly?: boolean;
}

/**
 * SessionRow 排版：
 *   - 上排：# / 課程名稱（吃大寬度）/ 時數 / 類型
 *   - 中排：說明（textarea）
 *   - 下排：主講人（整列寬，足以容納長字串如「待覓：具 AI 基礎知識的內部資深同仁」）
 */
function SessionRow({ session, onChange, onRemove, readOnly }: SessionRowProps) {
  const [showInstructors, setShowInstructors] = useState(false);
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-md p-3 bg-white dark:bg-slate-900">
      <div className="grid grid-cols-12 gap-2 items-end">
        <SessionField className="col-span-2 sm:col-span-1" label="#">
          <Input
            type="number"
            min={1}
            value={session.position}
            onChange={(e) => onChange({ position: Number(e.target.value) || 1 })}
            disabled={readOnly}
            className="h-8 text-sm tabular-nums"
          />
        </SessionField>
        <SessionField className="col-span-10 sm:col-span-7" label="課程名稱">
          <Input
            value={session.name}
            onChange={(e) => onChange({ name: e.target.value })}
            disabled={readOnly}
            className="h-8 text-sm"
          />
        </SessionField>
        <SessionField className="col-span-4 sm:col-span-2" label="時數">
          <Input
            type="number"
            step="0.5"
            min={0.5}
            value={session.hours}
            onChange={(e) => onChange({ hours: Number(e.target.value) || 0 })}
            disabled={readOnly}
            className="h-8 text-sm tabular-nums"
          />
        </SessionField>
        <SessionField className="col-span-8 sm:col-span-2" label="類型">
          <select
            value={session.type}
            onChange={(e) => onChange({ type: e.target.value as SessionItem["type"] })}
            disabled={readOnly}
            className="h-8 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-slate-100 px-2 text-sm"
          >
            {(["lecture", "exercise", "discussion", "case_study", "project"] as const).map((t) => (
              <option key={t} value={t}>
                {SESSION_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </SessionField>
      </div>
      <div className="mt-2">
        <SessionField label="課程內容描述">
          <Textarea
            rows={5}
            value={session.description}
            onChange={(e) => onChange({ description: e.target.value })}
            disabled={readOnly}
            placeholder="100~250 字：這堂課實際會講哪幾個重點、用什麼角度切入、學員可能會卡住的地方……"
            className="text-sm leading-relaxed"
          />
        </SessionField>
      </div>
      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
        <SessionField label="重點 bullet">
          <Textarea
            rows={4}
            value={(session.keyPoints ?? []).join("\n")}
            onChange={(e) =>
              onChange({
                keyPoints: e.target.value
                  .split(/\n/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            disabled={readOnly}
            placeholder={"一行一個重點\n例：Prompt 結構：角色／任務／格式／限制"}
            className="text-sm leading-relaxed"
          />
        </SessionField>
        <div className="space-y-2">
          <SessionField label="課中活動">
            <Textarea
              rows={2}
              value={session.inClassActivity ?? ""}
              onChange={(e) => onChange({ inClassActivity: e.target.value })}
              disabled={readOnly}
              placeholder="實作／演練／討論安排（純講授可寫「無，純講授 + Q&A」）"
              className="text-sm leading-relaxed"
            />
          </SessionField>
          <SessionField label="學員帶走">
            <Textarea
              rows={2}
              value={session.studentTakeaway ?? ""}
              onChange={(e) => onChange({ studentTakeaway: e.target.value })}
              disabled={readOnly}
              placeholder="學員上完這堂後具體帶走什麼成果或能力"
              className="text-sm leading-relaxed"
            />
          </SessionField>
        </div>
      </div>
      <div className="mt-2">
        <SessionField label="主講人">
          <Input
            value={session.primaryInstructorName || ""}
            onChange={(e) => onChange({ primaryInstructorName: e.target.value })}
            disabled={readOnly}
            className="h-8 text-sm w-full"
            placeholder="例：王小明 ／ 待覓：具 AI 基礎知識的內部資深同仁"
          />
        </SessionField>
      </div>
      {(session.alternativeInstructorNames?.length ?? 0) > 0 && (
        <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-slate-500 dark:text-slate-400">
          <button
            type="button"
            onClick={() => setShowInstructors((v) => !v)}
            className="hover:underline"
          >
            備選講師（{session.alternativeInstructorNames.length}）
          </button>
          {showInstructors &&
            session.alternativeInstructorNames.map((n, i) => (
              <Badge key={i} variant="outline" className="text-[10px]">
                {n}
              </Badge>
            ))}
        </div>
      )}
      {!readOnly && (
        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center gap-1"
          >
            <Trash2 className="h-3 w-3" /> 刪除
          </button>
        </div>
      )}
    </div>
  );
}

function SessionField({
  className,
  label,
  children,
}: {
  className?: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-0.5 block">
        {label}
      </Label>
      {children}
    </div>
  );
}
