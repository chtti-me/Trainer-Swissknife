"use client";

/**
 * 【全域當日授課清單】
 * 跨頁面的圓形按鈕 → 點擊展開 Popover，列出今天該培訓師擔任導師或講師的課程。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarCheck, MapPin, Clock, User, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface TodayClass {
  id: string;
  className: string;
  classCode: string | null;
  startDatetime: string | null;
  endDatetime: string | null;
  checkinDatetime: string | null;
  instructorNames: string | null;
  mentorName: string | null;
  roomName: string | null;
  location: string | null;
  campus: string | null;
  status: string | null;
  deliveryMode: string | null;
  role: string;
}

const STATUS_COLORS: Record<string, string> = {
  "已確認": "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "執行中": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "規劃中": "bg-muted text-muted-foreground",
  "已完成": "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  "已取消": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

function formatTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function GlobalTodayClasses() {
  const [open, setOpen] = useState(false);
  const [classes, setClasses] = useState<TodayClass[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchClasses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/today-classes");
      if (res.ok) setClasses(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) fetchClasses();
  }, [open, fetchClasses]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      {/* 圓形按鈕 */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
          "bg-card hover:bg-accent text-foreground/80",
          open && "ring-2 ring-primary"
        )}
        aria-label="今日課程"
        aria-expanded={open}
      >
        <CalendarCheck className="h-4.5 w-4.5" />
        {classes.length > 0 && !open && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {classes.length}
          </span>
        )}
      </button>

      {/* 面板 */}
      {open && (
        <div className="absolute right-0 top-full mt-2 z-[100] w-96 max-h-[70vh] overflow-auto rounded-xl border bg-card shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
          {/* 標題列 */}
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-card px-4 py-3">
            <CalendarCheck className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">今日授課清單</h3>
            <span className="text-xs text-muted-foreground">
              （{new Date().toLocaleDateString("zh-TW", { month: "long", day: "numeric", weekday: "short" })}，共 {classes.length} 堂）
            </span>
          </div>

          {/* 清單內容 */}
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">載入中...</div>
          ) : classes.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              今天沒有需要授課或擔任導師的課程 🎉
            </div>
          ) : (
            <div className="divide-y">
              {classes.map((c) => {
                const statusCls = (c.status && STATUS_COLORS[c.status]) || "bg-muted text-muted-foreground";
                return (
                  <div key={c.id} className="px-4 py-3 hover:bg-accent/30 transition-colors space-y-1.5">
                    {/* 班名 + 角色 */}
                    <div className="flex items-start gap-2">
                      <BookOpen className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">{c.className}</p>
                        {c.classCode && (
                          <p className="text-[11px] text-muted-foreground">{c.classCode}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-medium", statusCls)}>
                          {c.status}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                          {c.role}
                        </span>
                      </div>
                    </div>

                    {/* 詳細資訊 */}
                    <div className="ml-5.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span>{formatTime(c.startDatetime)} - {formatTime(c.endDatetime)}</span>
                      </div>
                      {c.roomName && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span>{c.roomName}</span>
                        </div>
                      )}
                      {c.instructorNames && (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 shrink-0" />
                          <span>講師：{c.instructorNames}</span>
                        </div>
                      )}
                      {c.campus && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span>{c.campus}</span>
                        </div>
                      )}
                      {c.deliveryMode && (
                        <div className="col-span-2 flex items-center gap-1">
                          <span>📡 {c.deliveryMode}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
