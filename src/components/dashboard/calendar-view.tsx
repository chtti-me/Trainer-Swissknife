"use client";

/**
 * 【儀表板月曆 + 自訂週曆】
 * - 月曆：FullCalendar dayGridMonth，週六日縮窄、hover 浮動、單日展開
 * - 週曆：自訂格狀版面（類似月曆但僅 1~2 週），完整顯示班名，支援單週/雙週切換
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DayCellMountArg, EventApi } from "@fullcalendar/core";
import { getCalendarEventColor } from "@/lib/utils";
import { ArrowLeft, ChevronLeft, ChevronRight, Clock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CalendarClass {
  id: string;
  className: string;
  classCode?: string | null;
  campus?: string | null;
  deliveryMode?: string | null;
  startDatetime?: string | null;
  endDatetime?: string | null;
  status: string;
  [key: string]: any;
}

interface CalendarViewProps {
  classes: CalendarClass[];
  onEventClick: (cls: CalendarClass) => void;
}

interface HoverInfo {
  x: number;
  y: number;
  cellWidth: number;
  cellHeight: number;
  date: string;
  events: Array<{ title: string; color: string; cls: CalendarClass }>;
}

type ViewMode = "month" | "week";
type WeekSpan = 1 | 2;

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

/** 將 Date 轉為本地 YYYY-MM-DD */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTime(dt: string | null | undefined): string {
  if (!dt) return "";
  const d = new Date(dt);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 取得指定日期所在週的週日（作為週起始） */
function getWeekStart(d: Date): Date {
  const result = new Date(d);
  result.setDate(result.getDate() - result.getDay());
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const STATUS_COLOR_MAP: Record<string, string> = {
  "已結訓": "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "已排定": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "即將開班": "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  "規劃中": "bg-muted text-muted-foreground",
};

export default function CalendarView({ classes, onEventClick }: CalendarViewProps) {
  const calendarRef = useRef<FullCalendar>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelHovered = useRef(false);
  const [singleDayDate, setSingleDayDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [weekSpan, setWeekSpan] = useState<WeekSpan>(1);
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));

  const events = classes
    .filter((c) => c.startDatetime)
    .map((c) => ({
      id: c.id,
      title: `${c.className}${c.campus ? ` [${c.campus}]` : ""}`,
      start: c.startDatetime as string,
      end: (c.endDatetime as string) || undefined,
      backgroundColor: getCalendarEventColor(c.status),
      borderColor: getCalendarEventColor(c.status),
      extendedProps: { cls: c },
    }));

  // ===== 事件依日期分組（週曆用）=====
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarClass[]>();
    classes.forEach((c) => {
      if (!c.startDatetime) return;
      const ds = toLocalDateStr(new Date(c.startDatetime));
      const arr = map.get(ds) || [];
      arr.push(c);
      map.set(ds, arr);
    });
    return map;
  }, [classes]);

  // ===== 週曆的日期陣列 =====
  const weekDays = useMemo(() => {
    const totalDays = weekSpan * 7;
    const days: Date[] = [];
    for (let i = 0; i < totalDays; i++) {
      days.push(addDays(weekStart, i));
    }
    return days;
  }, [weekStart, weekSpan]);

  const weekTitle = useMemo(() => {
    const first = weekDays[0];
    const last = weekDays[weekDays.length - 1];
    const fy = first.getFullYear();
    const fm = first.getMonth() + 1;
    const fd = first.getDate();
    const ly = last.getFullYear();
    const lm = last.getMonth() + 1;
    const ld = last.getDate();
    if (fy === ly && fm === lm) return `${fy} 年 ${fm} 月 ${fd} 日 ~ ${ld} 日`;
    if (fy === ly) return `${fy} 年 ${fm} 月 ${fd} 日 ~ ${lm} 月 ${ld} 日`;
    return `${fy}/${fm}/${fd} ~ ${ly}/${lm}/${ld}`;
  }, [weekDays]);

  // ===== 單日事件 =====
  const singleDayEvents = useMemo(() => {
    if (!singleDayDate) return [];
    return classes.filter((c) => {
      if (!c.startDatetime) return false;
      return toLocalDateStr(new Date(c.startDatetime)) === singleDayDate;
    });
  }, [singleDayDate, classes]);

  // ===== FullCalendar dayCellDidMount =====
  const handleDayCellDidMount = useCallback((arg: DayCellMountArg) => {
    const el = arg.el;
    const dateStr = toLocalDateStr(arg.date);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = "展開單日檢視（或雙擊日期格）";
    btn.className = "cal-day-expand-btn";
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      setSingleDayDate(dateStr);
    });

    const topRow = el.querySelector(".fc-daygrid-day-top");
    if (topRow) {
      (topRow as HTMLElement).style.position = "relative";
      topRow.insertBefore(btn, topRow.firstChild);
    }

    // 雙擊日期格進入單日模式
    el.addEventListener("dblclick", (e) => {
      e.preventDefault();
      setSingleDayDate(dateStr);
    });

    const showHover = () => {
      if (panelHovered.current) return;
      if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
      hoverTimeout.current = setTimeout(() => {
        if (panelHovered.current) return;
        const calApi = calendarRef.current?.getApi();
        if (!calApi) return;
        const dayEvents: HoverInfo["events"] = [];
        calApi.getEvents().forEach((ev: EventApi) => {
          const evStart = ev.start;
          if (!evStart) return;
          if (toLocalDateStr(evStart) === dateStr) {
            dayEvents.push({
              title: ev.title,
              color: ev.backgroundColor || "#3b82f6",
              cls: ev.extendedProps.cls as CalendarClass,
            });
          }
        });
        if (dayEvents.length === 0) return;
        const rect = el.getBoundingClientRect();
        setHoverInfo({
          x: rect.left, y: rect.top, cellWidth: rect.width, cellHeight: rect.height,
          date: dateStr, events: dayEvents,
        });
      }, 200);
    };

    const hideHover = () => {
      if (panelHovered.current) return;
      if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
      hoverTimeout.current = setTimeout(() => setHoverInfo(null), 150);
    };

    el.addEventListener("mouseenter", showHover);
    el.addEventListener("mouseleave", hideHover);
  }, []);

  useEffect(() => {
    return () => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current); };
  }, []);

  const todayStr = toLocalDateStr(new Date());

  // ======================================================================
  // 單日展開
  // ======================================================================
  if (singleDayDate) {
    const d = new Date(singleDayDate + "T00:00:00");
    const weekday = WEEKDAY_LABELS[d.getDay()];
    const dateLabel = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日（星期${weekday}）`;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setSingleDayDate(null)}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            {viewMode === "month" ? "返回月曆" : "返回週曆"}
          </button>
          <h3 className="text-base font-semibold">{dateLabel}</h3>
          <span className="text-sm text-muted-foreground">共 {singleDayEvents.length} 個班次</span>
        </div>
        {singleDayEvents.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm border border-dashed rounded-lg bg-muted/20">
            當日沒有班次
          </div>
        ) : (
          <div className="grid gap-2">
            {singleDayEvents.map((cls) => (
              <button
                key={cls.id}
                type="button"
                onClick={() => onEventClick(cls)}
                className="w-full text-left rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getCalendarEventColor(cls.status) }} />
                      <span className="font-semibold text-sm leading-snug">{cls.className}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {cls.classCode && <span>班代號：{cls.classCode}</span>}
                      {(cls.startDatetime || cls.endDatetime) && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(cls.startDatetime)}{cls.endDatetime && ` ~ ${formatTime(cls.endDatetime)}`}
                        </span>
                      )}
                      {cls.campus && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{cls.campus}</span>}
                      {cls.deliveryMode && <span>{cls.deliveryMode}</span>}
                      {cls.instructorNames && <span>講師：{cls.instructorNames}</span>}
                    </div>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_COLOR_MAP[cls.status] || "bg-muted text-muted-foreground")}>
                    {cls.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ======================================================================
  // 週曆模式（自訂格狀版面）
  // ======================================================================
  if (viewMode === "week") {
    const weeks: Date[][] = [];
    for (let w = 0; w < weekSpan; w++) {
      const row: Date[] = [];
      for (let d = 0; d < 7; d++) {
        row.push(addDays(weekStart, w * 7 + d));
      }
      weeks.push(row);
    }

    return (
      <div className="space-y-2">
        {/* 工具列 */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md border hover:bg-accent transition-colors"
              title="上一週"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setWeekStart(getWeekStart(new Date()))}
              className="h-8 px-3 rounded-md border text-xs font-medium hover:bg-accent transition-colors"
            >
              本週
            </button>
            <button
              type="button"
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md border hover:bg-accent transition-colors"
              title="下一週"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h3 className="text-sm font-semibold text-center flex-1">{weekTitle}</h3>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setWeekSpan(1)}
              className={cn(
                "h-8 px-3 rounded-md border text-xs font-medium transition-colors",
                weekSpan === 1 ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              )}
            >
              單週
            </button>
            <button
              type="button"
              onClick={() => setWeekSpan(2)}
              className={cn(
                "h-8 px-3 rounded-md border text-xs font-medium transition-colors",
                weekSpan === 2 ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              )}
            >
              雙週
            </button>
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className="h-8 px-3 rounded-md border text-xs font-medium hover:bg-accent transition-colors"
            >
              月曆
            </button>
          </div>
        </div>

        {/* 表頭 */}
        <div className="grid grid-cols-7 border-t border-l rounded-t-md overflow-hidden">
          {WEEKDAY_LABELS.map((label, i) => (
            <div
              key={label}
              className={cn(
                "text-center text-xs font-semibold py-1.5 border-r border-b bg-muted",
                (i === 0 || i === 6) ? "text-muted-foreground/70" : "text-foreground"
              )}
            >
              {label}
            </div>
          ))}
        </div>

        {/* 週列 */}
        {weeks.map((row, wi) => (
          <div key={wi} className="grid grid-cols-7 border-l" style={{ marginTop: wi === 0 ? 0 : undefined }}>
            {row.map((day, di) => {
              const ds = toLocalDateStr(day);
              const isToday = ds === todayStr;
              const isWeekend = di === 0 || di === 6;
              const dayClasses = eventsByDate.get(ds) || [];

              return (
                <div
                  key={ds}
                  className={cn(
                    "border-r border-b min-h-[5rem] p-1 relative group/wcell",
                    isToday ? "bg-accent/50" : isWeekend ? "bg-muted/30" : "bg-card"
                  )}
                >
                  {/* 日期數字 + 展開按鈕 */}
                  <div className="flex items-center justify-between mb-0.5">
                    <span
                      className={cn(
                        "text-xs font-medium leading-none px-1 py-0.5 rounded",
                        isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                      )}
                    >
                      {day.getDate()}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSingleDayDate(ds)}
                      className="cal-day-expand-btn opacity-0 group-hover/wcell:opacity-70 hover:!opacity-100"
                      title="展開單日檢視"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 3 21 3 21 9" />
                        <polyline points="9 21 3 21 3 15" />
                        <line x1="21" y1="3" x2="14" y2="10" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                      </svg>
                    </button>
                  </div>

                  {/* 事件清單 */}
                  <div className="space-y-0.5">
                    {dayClasses.map((cls) => (
                      <button
                        key={cls.id}
                        type="button"
                        onClick={() => onEventClick(cls)}
                        className="w-full text-left flex items-start gap-1 rounded px-1 py-0.5 hover:bg-accent/70 transition-colors group/ev"
                        title={`${formatTime(cls.startDatetime)} ${cls.className}${cls.campus ? ` [${cls.campus}]` : ""}`}
                      >
                        <span
                          className="mt-[3px] w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: getCalendarEventColor(cls.status) }}
                        />
                        <span className="text-[11px] leading-snug">
                          <span className="font-mono text-muted-foreground">{formatTime(cls.startDatetime)}</span>
                          {" "}
                          <span className="font-medium">{cls.className}</span>
                          {cls.campus && (
                            <span className="text-muted-foreground ml-0.5">[{cls.campus}]</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  // ======================================================================
  // 月曆模式（FullCalendar）
  // ======================================================================
  return (
    <div className="calendar-weekday-wide relative">
      {/* 自訂的「切換到週曆」按鈕列 */}
      <div className="flex justify-end mb-1">
        <button
          type="button"
          onClick={() => {
            setWeekStart(getWeekStart(new Date()));
            setViewMode("week");
          }}
          className="h-7 px-3 rounded-md border text-xs font-medium hover:bg-accent transition-colors"
        >
          週曆
        </button>
      </div>

      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        locale="zh-tw"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "",
        }}
        buttonText={{
          today: "今天",
          month: "月曆",
        }}
        events={events}
        eventClick={(info) => {
          const cls = info.event.extendedProps.cls;
          if (cls) onEventClick(cls);
        }}
        height="auto"
        dayMaxEvents={4}
        moreLinkText={(n) => `+${n} 個班次`}
        dayCellDidMount={handleDayCellDidMount}
      />

      {/* Hover 浮動面板（自適應位置） */}
      {hoverInfo && (
        <HoverPanel
          hoverInfo={hoverInfo}
          hoverTimeout={hoverTimeout}
          panelHovered={panelHovered}
          setHoverInfo={setHoverInfo}
          onEventClick={onEventClick}
        />
      )}
    </div>
  );
}

// ======================================================================
// 浮動面板（自適應位置 + 圖層鎖定：滑鼠在面板上時底層 cell 不響應 hover）
// ======================================================================
function HoverPanel({
  hoverInfo,
  hoverTimeout,
  panelHovered,
  setHoverInfo,
  onEventClick,
}: {
  hoverInfo: HoverInfo;
  hoverTimeout: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  panelHovered: React.MutableRefObject<boolean>;
  setHoverInfo: (v: HoverInfo | null) => void;
  onEventClick: (cls: CalendarClass) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  useEffect(() => {
    const panelEl = panelRef.current;
    if (!panelEl) return;

    const panelHeight = panelEl.offsetHeight;
    const panelWidth = 288;
    const gap = 6;

    let left = hoverInfo.x + hoverInfo.cellWidth / 2 - panelWidth / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - panelWidth - 8));

    const spaceAbove = hoverInfo.y - gap;
    const spaceBelow = window.innerHeight - (hoverInfo.y + hoverInfo.cellHeight + gap);

    let top: number;
    if (spaceAbove >= panelHeight) {
      top = hoverInfo.y - gap - panelHeight;
    } else if (spaceBelow >= panelHeight) {
      top = hoverInfo.y + hoverInfo.cellHeight + gap;
    } else {
      if (spaceAbove >= spaceBelow) {
        top = Math.max(8, hoverInfo.y - gap - panelHeight);
      } else {
        top = Math.min(window.innerHeight - panelHeight - 8, hoverInfo.y + hoverInfo.cellHeight + gap);
      }
    }

    setPos({ left, top });
  }, [hoverInfo]);

  return (
    <div
      ref={panelRef}
      className="fixed z-[100] max-w-sm w-72 rounded-lg border bg-popover text-popover-foreground shadow-xl p-3 space-y-1.5"
      style={{ left: pos.left, top: pos.top }}
      onMouseEnter={() => {
        panelHovered.current = true;
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
      }}
      onMouseLeave={() => {
        panelHovered.current = false;
        setHoverInfo(null);
      }}
    >
      <div className="text-xs font-semibold text-muted-foreground mb-1">
        {hoverInfo.date}（共 {hoverInfo.events.length} 個班次）
      </div>
      <div className="max-h-48 overflow-auto space-y-1">
        {hoverInfo.events.map((ev, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onEventClick(ev.cls)}
            className="w-full text-left flex items-start gap-2 rounded px-2 py-1 text-xs hover:bg-accent transition-colors"
          >
            <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ev.color }} />
            <span className="leading-snug">{ev.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
