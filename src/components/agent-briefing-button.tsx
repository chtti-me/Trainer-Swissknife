"use client";

/**
 * 【小瑞主動簡報按鈕】
 * 每日首次登入時，自動檢查是否有當日課程或即將到期的提醒，
 * 以通知氣泡提示使用者點擊查看。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface BriefingClass {
  name: string;
  code: string | null;
  time: string;
  room: string | null;
  instructor: string | null;
  status: string | null;
}

interface BriefingAlarm {
  content: string;
  importance: string;
  alarmAt: string;
}

interface BriefingData {
  date: string;
  todayClasses: BriefingClass[];
  tomorrowClasses: BriefingClass[];
  upcomingAlarms: BriefingAlarm[];
  unreadMemories: number;
}

const BRIEFING_STORAGE_KEY = "agent-briefing-dismissed";

export default function AgentBriefingButton() {
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);

  const fetchBriefing = useCallback(async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const dismissed = localStorage.getItem(BRIEFING_STORAGE_KEY);
      if (dismissed === today) return;

      const res = await fetch("/api/agent/briefing");
      if (!res.ok) return;
      const data = await res.json();
      if (data.hasContent) {
        setBriefing(data.briefing);
        setShow(true);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const timer = setTimeout(fetchBriefing, 3000);
    return () => clearTimeout(timer);
  }, [fetchBriefing]);

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

  function dismiss() {
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem(BRIEFING_STORAGE_KEY, today);
    setShow(false);
    setOpen(false);
  }

  if (!show) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
          "bg-gradient-to-br from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700",
          open && "ring-2 ring-primary"
        )}
        aria-label="小瑞日報"
      >
        <Bot className="h-4.5 w-4.5" />
        {!open && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white animate-pulse">
            !
          </span>
        )}
      </button>

      {open && briefing && (
        <div className="absolute right-0 top-full mt-2 z-[100] w-[420px] max-h-[70vh] overflow-auto rounded-xl border bg-card shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-gradient-to-r from-violet-500 to-purple-600 px-4 py-3 text-white rounded-t-xl">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              <h3 className="text-sm font-semibold">小瑞日報</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs opacity-80">{briefing.date}</span>
              <button type="button" onClick={dismiss} className="p-0.5 rounded hover:bg-white/20">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-4 text-sm">
            {briefing.todayClasses.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-1.5">
                  📋 今日課程（{briefing.todayClasses.length} 堂）
                </h4>
                <div className="space-y-1.5">
                  {briefing.todayClasses.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs">
                      <span className="font-medium flex-1 truncate">{c.name}</span>
                      <span className="text-muted-foreground shrink-0">{c.time}</span>
                      {c.room && <span className="text-muted-foreground shrink-0">📍{c.room}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {briefing.tomorrowClasses.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-1.5">
                  📅 明日課程（{briefing.tomorrowClasses.length} 堂）
                </h4>
                <div className="space-y-1.5">
                  {briefing.tomorrowClasses.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs">
                      <span className="font-medium flex-1 truncate">{c.name}</span>
                      <span className="text-muted-foreground shrink-0">{c.time}</span>
                      {c.room && <span className="text-muted-foreground shrink-0">📍{c.room}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {briefing.upcomingAlarms.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-1.5">
                  ⏰ 即將到期的提醒（{briefing.upcomingAlarms.length} 則）
                </h4>
                <div className="space-y-1.5">
                  {briefing.upcomingAlarms.map((a, i) => (
                    <div key={i} className={cn(
                      "rounded-lg border px-3 py-2 text-xs",
                      a.importance === "critical" ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30" :
                      a.importance === "important" ? "border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30" : ""
                    )}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{a.content}</span>
                        <span className="text-muted-foreground shrink-0 ml-2">{a.alarmAt}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {briefing.todayClasses.length === 0 && briefing.tomorrowClasses.length === 0 && briefing.upcomingAlarms.length === 0 && (
              <p className="text-center text-muted-foreground py-4">今天沒有特別需要注意的事項 🎉</p>
            )}

            <div className="flex justify-between items-center pt-2 border-t">
              <p className="text-[11px] text-muted-foreground">
                {briefing.unreadMemories > 0 && `📝 已儲存 ${briefing.unreadMemories} 筆長期記憶`}
              </p>
              <button
                type="button"
                onClick={dismiss}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                今天不再顯示
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
