import * as React from 'react';
import { create } from 'zustand';
import { CheckCircle2, AlertCircle, Info, Loader2, X } from 'lucide-react';
import { cn } from '@edm/lib/utils';

export type ToastVariant = 'default' | 'success' | 'error' | 'info' | 'loading';

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  /** ms；若為 Infinity 則不自動關閉（loading toast 用） */
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'> & { id?: string }) => string;
  /** v0.4.4：更新一個既有的 toast（用於 loading → success/error 切換） */
  update: (id: string, partial: Omit<Partial<Toast>, 'id'>) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = t.id ?? Math.random().toString(36).slice(2);
    const duration = t.duration ?? 4000;
    set((s) => ({ toasts: [...s.toasts, { ...t, id, duration }] }));
    if (Number.isFinite(duration)) {
      setTimeout(() => {
        // 用最新狀態檢查；如果 toast 期間被 update 過，duration 可能改了
        const current = get().toasts.find((x) => x.id === id);
        if (!current) return;
        // 如果 duration 在 update 後變成 Infinity 就不要關
        if (!Number.isFinite(current.duration ?? duration)) return;
        set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
      }, duration);
    }
    return id;
  },
  update: (id, partial) => {
    set((s) => {
      const next = s.toasts.map((t) => (t.id === id ? { ...t, ...partial } : t));
      return { toasts: next };
    });
    // 如果更新後 duration 變成有限值，要自動排程關閉
    const updated = get().toasts.find((x) => x.id === id);
    if (updated && partial.duration !== undefined && Number.isFinite(partial.duration)) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
      }, partial.duration);
    }
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(opts: Omit<Toast, 'id'>): string {
  return useToastStore.getState().push(opts);
}

/**
 * v0.4.4：建立一個「持續顯示」的 loading toast，回傳 handle 用來後續更新或關閉。
 *
 * 用法：
 *   const t = toastLoading({ title: '匯出中…', description: '步驟 1/3' });
 *   t.update({ description: '步驟 2/3' });
 *   t.success({ title: '完成' });
 *   // 或 t.error({ title: '失敗', description: '...' });
 */
export function toastLoading(opts: Omit<Toast, 'id' | 'variant' | 'duration'>): {
  id: string;
  update: (partial: Omit<Partial<Toast>, 'id'>) => void;
  success: (final: Omit<Partial<Toast>, 'id' | 'variant'>) => void;
  error: (final: Omit<Partial<Toast>, 'id' | 'variant'>) => void;
  dismiss: () => void;
} {
  const store = useToastStore.getState();
  const id = store.push({ ...opts, variant: 'loading', duration: Infinity });
  return {
    id,
    update: (partial) => useToastStore.getState().update(id, partial),
    success: (final) =>
      useToastStore.getState().update(id, { ...final, variant: 'success', duration: 4000 }),
    error: (final) =>
      useToastStore.getState().update(id, { ...final, variant: 'error', duration: 6000 }),
    dismiss: () => useToastStore.getState().dismiss(id),
  };
}

export function Toaster(): React.JSX.Element {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-96 max-w-full flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-lg',
            t.variant === 'success' && 'border-emerald-700 bg-emerald-950/90 text-emerald-100',
            t.variant === 'error' && 'border-red-700 bg-red-950/90 text-red-100',
            t.variant === 'info' && 'border-sky-700 bg-sky-950/90 text-sky-100',
            t.variant === 'loading' && 'border-amber-700 bg-amber-950/90 text-amber-100',
            (!t.variant || t.variant === 'default') && 'border-border bg-card/95 text-foreground',
          )}
        >
          <div className="mt-0.5 shrink-0">
            {t.variant === 'success' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : t.variant === 'error' ? (
              <AlertCircle className="h-4 w-4" />
            ) : t.variant === 'loading' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Info className="h-4 w-4" />
            )}
          </div>
          <div className="flex-1 text-sm">
            {t.title && <div className="font-medium leading-tight">{t.title}</div>}
            {t.description && <div className="mt-1 text-xs opacity-90">{t.description}</div>}
          </div>
          <button
            className="shrink-0 opacity-50 hover:opacity-100"
            onClick={() => dismiss(t.id)}
            aria-label="關閉"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
