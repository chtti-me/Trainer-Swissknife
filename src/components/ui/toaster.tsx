"use client";

/**
 * 【Toast 通知】全域 Toast 容器 + 簡易 hook
 */
import { createContext, useCallback, useContext, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastCtx {
  toast: (message: string, type?: Toast["type"]) => void;
}

const ToastContext = createContext<ToastCtx>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

/** 全域 toast（不需要在元件內使用 hook） */
let _globalToast: ToastCtx["toast"] | null = null;
export function setGlobalToast(fn: ToastCtx["toast"]) { _globalToast = fn; }
export function globalToast(message: string, type: Toast["type"] = "info") {
  if (_globalToast) _globalToast(message, type);
}

let nextId = 0;

const TYPE_STYLES: Record<Toast["type"], string> = {
  success: "border-l-green-500 bg-green-50 dark:bg-green-950/30 text-green-900 dark:text-green-200",
  error: "border-l-red-500 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-200",
  info: "border-l-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // 註冊全域 toast
  useState(() => setGlobalToast(addToast));

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[300] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={cn(
                "rounded-lg border border-l-[3px] shadow-lg px-4 py-2.5 text-sm flex items-center justify-between gap-2 animate-in slide-in-from-bottom-3 fade-in duration-200",
                TYPE_STYLES[t.type]
              )}
            >
              <span>{t.message}</span>
              <button type="button" onClick={() => dismiss(t.id)} className="shrink-0 opacity-60 hover:opacity-100">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
