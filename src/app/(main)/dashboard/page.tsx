"use client";

/**
 * 【培訓師儀表板】
 * 摘要卡片、月曆／班次列表、班次詳情；資料來自 /api/dashboard/summary 與 /api/classes。
 */
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Calendar as CalendarIcon,
  AlertTriangle,
  Clock,
  MapPin,
  BookOpen,
  RefreshCw,
  Search,
  ChevronRight,
  AlertCircle,
  Info,
  Download,
} from "lucide-react";
import { cn, formatDate, formatDateTime, getStatusColor, getCampusColor } from "@/lib/utils";
import { PageHeading } from "@/components/layout/page-heading";
import dynamic from "next/dynamic";
import type { CalendarClass } from "@/components/dashboard/calendar-view";

const CalendarView = dynamic(() => import("@/components/dashboard/calendar-view"), { ssr: false });
import { TruncateCell } from "@/components/ui/truncate-cell";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { ClassDetailDialog } from "@/components/dashboard/class-detail-dialog";

/** TIS 導師顯示：camelCase／snake_case 皆可（避免序列化或合併後欄位名不一致） */
function tisMentorLabel(c: TrainingClass | CalendarClass): string {
  const a = c.mentorName;
  if (typeof a === "string" && a.trim()) return a.trim();
  const b = (c as Record<string, unknown>)["mentor_name"];
  if (typeof b === "string" && b.trim()) return b.trim();
  return "-";
}

interface TrainingClass {
  id: string;
  classCode: string | null;
  className: string;
  campus: string | null;
  category: string | null;
  classType: string | null;
  difficultyLevel: string | null;
  deliveryMode: string | null;
  startDatetime: string | null;
  endDatetime: string | null;
  checkinDatetime: string | null;
  graduationDatetime: string | null;
  instructorNames: string | null;
  /** TIS「導師」＝培訓師姓名快照（非講師） */
  mentorName: string | null;
  location: string | null;
  roomName: string | null;
  summary: string | null;
  audience: string | null;
  status: string;
  requestSource: string | null;
  maxStudents: number | null;
  materialLink: string | null;
  notes: string | null;
  trainer?: { name: string; department?: string; email?: string };
}

interface DashboardSummary {
  totalClasses: number;
  upcomingClasses: number;
  soonClasses: TrainingClass[];
  reminders: {
    soonCount: number;
    missingInstructor: number;
    missingRoom: number;
    incompleteClasses: number;
    missingRequestSource: number;
  };
  latestSync: {
    sourceName: string;
    status: string;
    startedAt: string;
    totalCount: number;
    successCount: number;
    failedCount: number;
  } | null;
}

/** 點擊 KPI 後在清單／月曆套用的篩選（與 /api/dashboard/summary 計數邏輯對齊） */
type KpiFilter =
  | null
  | "soon7"
  | "upcoming90"
  | "missing-instructor"
  | "missing-room"
  | "incomplete"
  | "missing-source"
  | "any-reminder";

const KPI_TOOLTIP_LINES = 10;

function parseClassStart(c: TrainingClass): Date | null {
  if (!c.startDatetime) return null;
  const d = new Date(c.startDatetime);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isStartFromNow(c: TrainingClass, now: Date): boolean {
  const d = parseClassStart(c);
  return d !== null && d >= now;
}

/** 與 summary API 相同條件，供 Tooltip 與點擊篩選共用 */
function buildKpiSlices(classes: TrainingClass[], now: Date) {
  const seven = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const ninety = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const soon7 = classes.filter((c) => {
    const d = parseClassStart(c);
    return d !== null && d >= now && d <= seven;
  });

  const upcoming90 = classes.filter((c) => {
    const d = parseClassStart(c);
    return d !== null && d >= now && d <= ninety;
  });

  const missingInstructor = classes.filter(
    (c) => isStartFromNow(c, now) && (c.instructorNames == null || !String(c.instructorNames).trim())
  );

  const missingRoom = classes.filter(
    (c) => isStartFromNow(c, now) && (c.roomName == null || !String(c.roomName).trim())
  );

  const incomplete = classes.filter(
    (c) =>
      isStartFromNow(c, now) &&
      (c.summary == null || c.audience == null)
  );

  const missingRequestSource = classes.filter(
    (c) => c.classType === "臨時需求專案班" && (c.requestSource == null || !String(c.requestSource).trim())
  );

  const anyReminderIds = new Set<string>();
  for (const x of [...missingInstructor, ...missingRoom, ...incomplete, ...missingRequestSource]) {
    anyReminderIds.add(x.id);
  }
  const anyReminder = classes.filter((c) => anyReminderIds.has(c.id));

  return {
    soon7,
    upcoming90,
    missingInstructor,
    missingRoom,
    incomplete,
    missingRequestSource,
    anyReminder,
  };
}

/** KPI 懸浮提示內容：對齊 shadcn 卡片／Badge 風格 */
function KpiTooltipBody({
  intro,
  list,
  emptyLabel,
  clickHint,
  accentBorderClass,
}: {
  intro: string;
  list: TrainingClass[];
  emptyLabel: string;
  clickHint: string;
  accentBorderClass: string;
}) {
  const shown = list.slice(0, KPI_TOOLTIP_LINES);
  const rest = Math.max(0, list.length - KPI_TOOLTIP_LINES);

  return (
    <div className={cn("min-w-[15.5rem] max-w-[20rem] space-y-2 border-l-[3px] pl-2.5", accentBorderClass)}>
      <p className="text-[11px] font-semibold leading-snug tracking-tight text-foreground">{intro}</p>
      <Separator className="bg-border/80" />
      {list.length === 0 ? (
        <p className="rounded-md border border-dashed border-muted-foreground/25 bg-muted/30 px-2.5 py-2 text-center text-[11px] text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <ul className="space-y-1.5 pr-0.5 [scrollbar-width:thin]">
          {shown.map((c) => (
            <li
              key={c.id}
              className="rounded-md border border-border/70 bg-muted/35 px-2 py-1.5 shadow-sm backdrop-blur-[2px]"
            >
              <p className="line-clamp-2 text-[11px] font-medium leading-snug text-foreground">
                {(c.className || "").trim() || "（無班名）"}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {c.classCode?.trim() ? (
                  <Badge variant="outline" className="h-5 border-border/80 px-1.5 py-0 text-[10px] font-normal">
                    {c.classCode.trim()}
                  </Badge>
                ) : null}
                {formatDate(c.startDatetime) ? (
                  <span className="rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground tabular-nums">
                    {formatDate(c.startDatetime)}
                  </span>
                ) : null}
                {c.campus ? (
                  <Badge variant="outline" className={cn("h-5 px-1.5 py-0 text-[10px] font-normal", getCampusColor(c.campus))}>
                    {c.campus}
                  </Badge>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {rest > 0 ? (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          尚餘 <span className="font-medium text-foreground tabular-nums">{rest}</span> 筆，點擊按鈕可於清單檢視全部。
        </p>
      ) : null}
      <Separator className="bg-border/80" />
      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden />
        <span>{clickHint}</span>
      </p>
    </div>
  );
}

type KpiSlices = ReturnType<typeof buildKpiSlices>;

function RemindersTooltipBody({ slices, clickHint }: { slices: KpiSlices; clickHint: string }) {
  const stats = [
    { label: "未填授課講師", n: slices.missingInstructor.length, bar: "border-l-red-500", bg: "bg-red-500/[0.08]" },
    { label: "缺少教室", n: slices.missingRoom.length, bar: "border-l-amber-500", bg: "bg-amber-500/[0.08]" },
    { label: "摘要／對象未填", n: slices.incomplete.length, bar: "border-l-slate-500", bg: "bg-slate-500/[0.08]" },
    { label: "專案班缺來源", n: slices.missingRequestSource.length, bar: "border-l-violet-500", bg: "bg-violet-500/[0.08]" },
  ];
  const shown = slices.anyReminder.slice(0, KPI_TOOLTIP_LINES);
  const rest = Math.max(0, slices.anyReminder.length - KPI_TOOLTIP_LINES);

  return (
    <div className="min-w-[16.5rem] max-w-[22rem] space-y-2 pl-2.5 border-l-[3px] border-l-rose-500">
      <div>
        <p className="text-[11px] font-semibold leading-snug text-foreground">待處理提醒</p>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          同一班次可能同時符合多項。下方為各類筆數與<strong className="font-medium text-foreground">不重複班次</strong>預覽。
        </p>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {stats.map((s) => (
          <div
            key={s.label}
            className={cn(
              "rounded-md border border-border/60 py-1.5 pl-2 pr-1.5 shadow-sm",
              s.bg,
              "border-l-[3px]",
              s.bar
            )}
          >
            <p className="text-center text-lg font-bold tabular-nums leading-none text-foreground">{s.n}</p>
            <p className="mt-1 text-center text-[9px] font-medium leading-tight text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1.5 text-[10px]">
        <span className="text-muted-foreground">不重複班次合計</span>
        <Badge variant="secondary" className="h-5 tabular-nums">
          {slices.anyReminder.length} 班
        </Badge>
      </div>
      <Separator className="bg-border/80" />
      {slices.anyReminder.length === 0 ? (
        <p className="rounded-md border border-dashed border-muted-foreground/25 bg-muted/30 px-2.5 py-2 text-center text-[11px] text-muted-foreground">
          目前沒有待處理提醒班次。
        </p>
      ) : (
        <ul className="space-y-1.5 pr-0.5 [scrollbar-width:thin]">
          {shown.map((c) => (
            <li
              key={c.id}
              className="rounded-md border border-border/70 bg-background/80 px-2 py-1.5 text-[11px] leading-snug shadow-sm"
            >
              <span className="font-medium text-foreground">{(c.className || "").trim() || "（無班名）"}</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {c.classCode?.trim() ? (
                  <Badge variant="outline" className="h-5 px-1.5 py-0 text-[10px] font-normal">
                    {c.classCode.trim()}
                  </Badge>
                ) : null}
                {formatDate(c.startDatetime) ? (
                  <span className="text-[10px] text-muted-foreground tabular-nums">{formatDate(c.startDatetime)}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {rest > 0 ? (
        <p className="text-[10px] text-muted-foreground">
          尚餘 <span className="font-medium text-foreground tabular-nums">{rest}</span> 筆…
        </p>
      ) : null}
      <Separator className="bg-border/80" />
      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden />
        <span>{clickHint}</span>
      </p>
    </div>
  );
}

const KPI_FILTER_LABEL: Record<Exclude<KpiFilter, null>, string> = {
  soon7: "7 天內開班",
  upcoming90: "未來 90 天內開班",
  "missing-instructor": "未填授課講師",
  "missing-room": "缺少教室資料",
  incomplete: "摘要或培訓對象未填",
  "missing-source": "專案班未填需求來源",
  "any-reminder": "待處理提醒（任一項）",
};

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [classes, setClasses] = useState<TrainingClass[]>([]);
  const [selectedClass, setSelectedClass] = useState<TrainingClass | CalendarClass | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState("calendar");
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);

  // 篩選
  const [keyword, setKeyword] = useState("");
  const [campusFilter, setCampusFilter] = useState("all");
  const [classTypeFilter, setClassTypeFilter] = useState("all");
  const [deliveryModeFilter, setDeliveryModeFilter] = useState("all");

  const dataNow = useMemo(() => new Date(), [classes, summary]);
  const kpiSlices = useMemo(() => buildKpiSlices(classes, dataNow), [classes, dataNow]);

  const kpiAllowedIds = useMemo(() => {
    if (!kpiFilter) return null;
    const pick = {
      soon7: kpiSlices.soon7,
      upcoming90: kpiSlices.upcoming90,
      "missing-instructor": kpiSlices.missingInstructor,
      "missing-room": kpiSlices.missingRoom,
      incomplete: kpiSlices.incomplete,
      "missing-source": kpiSlices.missingRequestSource,
      "any-reminder": kpiSlices.anyReminder,
    }[kpiFilter];
    return new Set(pick.map((c) => c.id));
  }, [kpiFilter, kpiSlices]);

  const applyKpiAndGoToList = (filter: KpiFilter) => {
    setKpiFilter(filter);
    setMainTab("list");
    requestAnimationFrame(() => {
      mainContentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const remindersTotal =
    (summary?.reminders.missingInstructor || 0) +
    (summary?.reminders.missingRoom || 0) +
    (summary?.reminders.incompleteClasses || 0) +
    (summary?.reminders.missingRequestSource || 0);

  const clickHint = "點擊：切換至「班次清單」並套用篩選";

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, classesRes] = await Promise.all([
        fetch("/api/dashboard/summary"),
        fetch("/api/classes"),
      ]);
      const summaryData = await summaryRes.json();
      const classesData = await classesRes.json();
      setSummary(summaryData);
      setClasses(classesData);
    } catch (e) {
      console.error("載入失敗:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openDetail = async (cls: TrainingClass | CalendarClass) => {
    try {
      const res = await fetch(`/api/classes/${cls.id}`);
      const data = await res.json();
      // 成功時以 API 為準，並與列表列合併，避免欄位遺漏；失敗時勿把 { error } 當成班次（否則 mentorName 等會變成 "-"）。
      if (res.ok && data && typeof data.id === "string") {
        setSelectedClass({ ...cls, ...data });
      } else {
        setSelectedClass(cls);
        if (data?.error) console.warn("班次詳情載入失敗:", data.error);
      }
    } catch {
      setSelectedClass(cls);
    }
    setDetailOpen(true);
  };

  const filteredClasses = classes.filter((c) => {
    if (kpiAllowedIds && !kpiAllowedIds.has(c.id)) return false;
    if (campusFilter !== "all" && c.campus !== campusFilter) return false;
    if (classTypeFilter !== "all" && c.classType !== classTypeFilter) return false;
    if (deliveryModeFilter !== "all" && c.deliveryMode !== deliveryModeFilter) return false;
    if (keyword) {
      const kw = keyword.toLowerCase();
      if (
        !c.className.toLowerCase().includes(kw) &&
        !(c.classCode || "").toLowerCase().includes(kw) &&
        !(c.instructorNames || "").toLowerCase().includes(kw) &&
        !(c.mentorName || "").toLowerCase().includes(kw) &&
        !(c.trainer?.name || "").toLowerCase().includes(kw)
      )
        return false;
    }
    return true;
  });

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <TooltipProvider delayDuration={350}>
      <div className="space-y-3">
        <PageHeading
          title="培訓師儀表板"
          description="查看您負責的班次與近期工作重點"
          className="mb-3 gap-2 sm:gap-3 [&_h1]:text-xl [&_p]:text-xs [&_p]:mt-0.5"
        />

        {/* KPI：緊湊列；hover 預覽班次、click 帶篩選到清單 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => applyKpiAndGoToList(null)}
                className="rounded-lg border bg-card text-left border-l-[3px] border-l-blue-500 shadow-sm outline-none transition hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring px-2.5 py-2 card-hover-lift"
                aria-label="總班次數：檢視全部班次清單"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] leading-tight text-muted-foreground">總班次數</p>
                    <p className="text-xl font-bold tabular-nums leading-tight">{summary?.totalClasses ?? 0}</p>
                  </div>
                  <BookOpen className="w-4 h-4 shrink-0 text-blue-500 opacity-85" aria-hidden />
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              className="max-h-[min(22rem,72vh)] w-[calc(100vw-1.5rem)] max-w-[21rem] overflow-y-auto border-border/80 bg-popover/95 p-3 text-popover-foreground shadow-lg backdrop-blur-sm supports-[backdrop-filter]:bg-popover/90"
            >
              <KpiTooltipBody
                intro="您在此儀表板可見範圍內的全部班次（與下方清單一致）。"
                list={classes}
                emptyLabel="尚無班次資料。"
                clickHint={clickHint}
                accentBorderClass="border-l-blue-500"
              />
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => applyKpiAndGoToList("soon7")}
                className="rounded-lg border bg-card text-left border-l-[3px] border-l-orange-500 shadow-sm outline-none transition hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring px-2.5 py-2 card-hover-lift"
                aria-label="7 天內開班：篩選清單"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] leading-tight text-muted-foreground">7 天內開班</p>
                    <p className="text-xl font-bold tabular-nums leading-tight">{summary?.reminders.soonCount ?? 0}</p>
                  </div>
                  <Clock className="w-4 h-4 shrink-0 text-orange-500 opacity-85" aria-hidden />
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              className="max-h-[min(22rem,72vh)] w-[calc(100vw-1.5rem)] max-w-[21rem] overflow-y-auto border-border/80 bg-popover/95 p-3 text-popover-foreground shadow-lg backdrop-blur-sm supports-[backdrop-filter]:bg-popover/90"
            >
              <KpiTooltipBody
                intro="開班日（開始時間）落在今天起算 7 天內的班次。"
                list={kpiSlices.soon7}
                emptyLabel="目前沒有 7 天內開班的班次。"
                clickHint={clickHint}
                accentBorderClass="border-l-orange-500"
              />
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => applyKpiAndGoToList("upcoming90")}
                className="rounded-lg border bg-card text-left border-l-[3px] border-l-emerald-500 shadow-sm outline-none transition hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring px-2.5 py-2 card-hover-lift"
                aria-label="未來 90 天班次：篩選清單"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] leading-tight text-muted-foreground">未來 90 天班次</p>
                    <p className="text-xl font-bold tabular-nums leading-tight">{summary?.upcomingClasses ?? 0}</p>
                  </div>
                  <CalendarIcon className="w-4 h-4 shrink-0 text-emerald-500 opacity-85" aria-hidden />
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              className="max-h-[min(22rem,72vh)] w-[calc(100vw-1.5rem)] max-w-[21rem] overflow-y-auto border-border/80 bg-popover/95 p-3 text-popover-foreground shadow-lg backdrop-blur-sm supports-[backdrop-filter]:bg-popover/90"
            >
              <KpiTooltipBody
                intro="開班日在今天之後、90 天內（含）的班次。"
                list={kpiSlices.upcoming90}
                emptyLabel="目前沒有符合條件的班次。"
                clickHint={clickHint}
                accentBorderClass="border-l-emerald-500"
              />
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => applyKpiAndGoToList("any-reminder")}
                className="rounded-lg border bg-card text-left border-l-[3px] border-l-rose-500 shadow-sm outline-none transition hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring px-2.5 py-2 card-hover-lift"
                aria-label="待處理提醒：篩選清單"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] leading-tight text-muted-foreground">待處理提醒</p>
                    <p className="text-xl font-bold tabular-nums leading-tight">{remindersTotal}</p>
                  </div>
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 opacity-85" aria-hidden />
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              className="max-h-[min(26rem,78vh)] w-[calc(100vw-1.5rem)] max-w-[23rem] overflow-y-auto border-border/80 bg-popover/95 p-3 text-popover-foreground shadow-lg backdrop-blur-sm supports-[backdrop-filter]:bg-popover/90"
            >
              <RemindersTooltipBody slices={kpiSlices} clickHint={clickHint} />
            </TooltipContent>
          </Tooltip>
        </div>

        {/* 工作提醒：單列緊湊標籤，可點擊套用單一篩選 */}
        {summary && (
          <div className="flex flex-wrap items-center gap-1.5">
            {summary.reminders.soonCount > 0 && (
              <button
                type="button"
                onClick={() => applyKpiAndGoToList("soon7")}
                className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] leading-snug text-orange-900 hover:bg-orange-100/90"
              >
                <AlertCircle className="w-3 h-3 shrink-0" aria-hidden />
                {summary.reminders.soonCount} 班 · 7 天內開班
              </button>
            )}
            {summary.reminders.missingInstructor > 0 && (
              <button
                type="button"
                onClick={() => applyKpiAndGoToList("missing-instructor")}
                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] leading-snug text-red-900 hover:bg-red-100/90"
              >
                <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden />
                {summary.reminders.missingInstructor} 班 · 未填講師
              </button>
            )}
            {summary.reminders.missingRoom > 0 && (
              <button
                type="button"
                onClick={() => applyKpiAndGoToList("missing-room")}
                className="inline-flex items-center gap-1 rounded-md border border-yellow-200 bg-yellow-50 px-2 py-1 text-[11px] leading-snug text-yellow-900 hover:bg-yellow-100/90"
              >
                <MapPin className="w-3 h-3 shrink-0" aria-hidden />
                {summary.reminders.missingRoom} 班 · 缺教室
              </button>
            )}
            {summary.reminders.incompleteClasses > 0 && (
              <button
                type="button"
                onClick={() => applyKpiAndGoToList("incomplete")}
                className="inline-flex items-center gap-1 rounded-md border bg-secondary px-2 py-1 text-[11px] leading-snug text-secondary-foreground hover:bg-accent"
              >
                <Info className="w-3 h-3 shrink-0" aria-hidden />
                {summary.reminders.incompleteClasses} 班 · 摘要／對象未填
              </button>
            )}
            {summary.reminders.missingRequestSource > 0 && (
              <button
                type="button"
                onClick={() => applyKpiAndGoToList("missing-source")}
                className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-1 text-[11px] leading-snug text-purple-900 hover:bg-purple-100/90"
              >
                <Info className="w-3 h-3 shrink-0" aria-hidden />
                {summary.reminders.missingRequestSource} 班 · 專案班缺來源
              </button>
            )}
          </div>
        )}

        {/* 同步狀態 */}
        {summary?.latestSync && (
          <div className="rounded-md border border-dashed bg-muted/30 px-2.5 py-1.5 flex items-start gap-2 text-[11px] leading-snug text-muted-foreground">
            <RefreshCw className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
            <span>
              最近同步：{summary.latestSync.sourceName} /{" "}
              <span className={summary.latestSync.status === "success" ? "text-green-700" : "text-red-600"}>
                {summary.latestSync.status === "success" ? "成功" : "失敗"}
              </span>{" "}
              / {formatDateTime(summary.latestSync.startedAt)} / 共 {summary.latestSync.totalCount} 筆（成功 {summary.latestSync.successCount}，失敗 {summary.latestSync.failedCount}）
            </span>
          </div>
        )}

        {/* 月曆 / 班次清單 */}
        <div ref={mainContentRef}>
          <Tabs value={mainTab} onValueChange={setMainTab}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TabsList className="h-8">
                <TabsTrigger value="calendar" className="text-xs px-2.5 py-1">
                  月曆檢視
                </TabsTrigger>
                <TabsTrigger value="list" className="text-xs px-2.5 py-1">
                  班次清單
                </TabsTrigger>
              </TabsList>
              {kpiFilter ? (
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="secondary" className="font-normal max-w-[min(100%,18rem)] truncate">
                    篩選：{KPI_FILTER_LABEL[kpiFilter]}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setKpiFilter(null)}
                  >
                    清除
                  </Button>
                </div>
              ) : null}
            </div>

            <TabsContent value="calendar" className="mt-2">
              <Card>
                <CardContent className="p-3">
                  <CalendarView classes={filteredClasses} onEventClick={openDetail} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="list" className="mt-2 space-y-3">
          {/* 篩選列 */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div className="relative md:col-span-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="搜尋班名、班代號、講師..." className="pl-9" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
                </div>
                <Select value={campusFilter} onValueChange={setCampusFilter}>
                  <SelectTrigger><SelectValue placeholder="院所別" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部院所</SelectItem>
                    <SelectItem value="院本部">院本部</SelectItem>
                    <SelectItem value="台中所">台中所</SelectItem>
                    <SelectItem value="高雄所">高雄所</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={classTypeFilter} onValueChange={setClassTypeFilter}>
                  <SelectTrigger><SelectValue placeholder="班次類型" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部類型</SelectItem>
                    <SelectItem value="年度計畫班">年度計畫班</SelectItem>
                    <SelectItem value="臨時需求專案班">臨時需求專案班</SelectItem>
                    <SelectItem value="學程班">學程班</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={deliveryModeFilter} onValueChange={setDeliveryModeFilter}>
                  <SelectTrigger><SelectValue placeholder="開班方式" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部方式</SelectItem>
                    <SelectItem value="課堂">課堂</SelectItem>
                    <SelectItem value="直播">直播</SelectItem>
                    <SelectItem value="遠距">遠距</SelectItem>
                    <SelectItem value="混成">混成</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = "/api/classes/export";
                    a.download = "";
                    a.click();
                  }}
                >
                  <Download className="w-3 h-3" />
                  匯出 CSV
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 列表 */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">班名</th>
                      <th className="text-left p-3 font-medium">班代號</th>
                      <th className="text-left p-3 font-medium">院所別</th>
                      <th className="text-left p-3 font-medium">開班日期</th>
                      <th className="text-left p-3 font-medium">方式</th>
                      <th className="text-left p-3 font-medium">培訓師（系統帳號／TIS）</th>
                      <th className="text-left p-3 font-medium">狀態</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClasses.map((cls) => (
                      <tr key={cls.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(cls)}>
                        <td className="p-3 font-medium max-w-[200px]">
                          <TruncateCell>{cls.className}</TruncateCell>
                        </td>
                        <td className="p-3 text-muted-foreground">{cls.classCode || "-"}</td>
                        <td className="p-3">
                          {cls.campus && <Badge variant="outline" className={getCampusColor(cls.campus)}>{cls.campus}</Badge>}
                        </td>
                        <td className="p-3 text-muted-foreground">{formatDate(cls.startDatetime)}</td>
                        <td className="p-3">{cls.deliveryMode || "-"}</td>
                        <td className="p-3 text-muted-foreground max-w-[140px]">
                          <TruncateCell>{cls.trainer?.name || cls.mentorName || "-"}</TruncateCell>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={getStatusColor(cls.status)}>{cls.status}</Badge>
                        </td>
                        <td className="p-3">
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </td>
                      </tr>
                    ))}
                    {filteredClasses.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-muted-foreground">
                          沒有符合條件的班次
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
            </TabsContent>
          </Tabs>
        </div>

        <ClassDetailDialog
          selectedClass={selectedClass}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />
      </div>
    </TooltipProvider>
  );
}
