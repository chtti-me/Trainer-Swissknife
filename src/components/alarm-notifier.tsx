"use client";

/**
 * 【鬧鈴通知器】
 * 每 30 秒輪詢 /api/notes/alarms，到期時彈出 in-app toast + 瀏覽器 Notification。
 * 放在 main layout 中，登入後全域運作。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, X, AlertTriangle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlarmNote {
  id: string;
  classId: string | null;
  content: string;
  importance: "normal" | "important" | "critical";
  alarmAt: string;
}

const POLL_INTERVAL_MS = 30_000;

const IMPORTANCE_MAP = {
  normal: { label: "一般", icon: Bell, borderClass: "border-l-green-500", bgClass: "bg-green-50 dark:bg-green-950/30" },
  important: { label: "重要", icon: AlertTriangle, borderClass: "border-l-yellow-500", bgClass: "bg-yellow-50 dark:bg-yellow-950/30" },
  critical: { label: "極重要", icon: AlertCircle, borderClass: "border-l-red-500", bgClass: "bg-red-50 dark:bg-red-950/30" },
} as const;

export default function AlarmNotifier() {
  const [toasts, setToasts] = useState<AlarmNote[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const requestBrowserPermission = useCallback(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const showBrowserNotification = useCallback((note: AlarmNote) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const imp = IMPORTANCE_MAP[note.importance] || IMPORTANCE_MAP.normal;
    new Notification(`⏰ 備註提醒 [${imp.label}]`, {
      body: note.content.slice(0, 200),
      tag: note.id,
      requireInteraction: note.importance === "critical",
    });
  }, []);

  const pollAlarms = useCallback(async () => {
    try {
      const res = await fetch("/api/notes/alarms");
      if (!res.ok) return;
      const data: AlarmNote[] = await res.json();
      if (data.length === 0) return;

      setToasts((prev) => {
        const existing = new Set(prev.map((t) => t.id));
        const newOnes = data.filter((d) => !existing.has(d.id));
        return [...newOnes, ...prev];
      });

      data.forEach(showBrowserNotification);
    } catch { /* ignore */ }
  }, [showBrowserNotification]);

  useEffect(() => {
    requestBrowserPermission();
    pollAlarms();
    intervalRef.current = setInterval(pollAlarms, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pollAlarms, requestBrowserPermission]);

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function dismissAll() {
    setToasts([]);
  }

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 max-w-sm w-80">
      {toasts.length > 1 && (
        <div className="flex justify-between items-center px-2">
          <span className="text-xs text-muted-foreground font-medium">
            {toasts.length} 則提醒
          </span>
          <button
            type="button"
            onClick={dismissAll}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            全部關閉
          </button>
        </div>
      )}
      {toasts.map((t) => {
        const imp = IMPORTANCE_MAP[t.importance] || IMPORTANCE_MAP.normal;
        const Icon = imp.icon;
        return (
          <div
            key={t.id}
            className={cn(
              "rounded-lg border border-l-[4px] shadow-lg p-3 animate-in slide-in-from-right-5 fade-in duration-300",
              imp.borderClass,
              imp.bgClass
            )}
          >
            <div className="flex items-start gap-2">
              <Icon className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-xs font-semibold">⏰ 備註提醒 [{imp.label}]</p>
                <p className="text-sm leading-snug whitespace-pre-wrap">{t.content}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 p-0.5 rounded hover:bg-background/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
