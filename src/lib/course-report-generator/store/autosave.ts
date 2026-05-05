/**
 * 【課程規劃報告產生器 - autosave hook】
 *
 * 訂閱 reportStore，1.5 秒 debounce 後寫入 IndexedDB。
 * 必須在 reportStore.hydrate() 完成後才開始訂閱（避免覆蓋還沒載入的草稿）。
 */
"use client";

import { useEffect, useRef } from "react";
import { useReportStore } from "./reportStore";
import { saveDraft } from "../lib/storage/idb";

const DEBOUNCE_MS = 1500;

export function useAutosave(userId: string, enabled: boolean): void {
  const lastWriteRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !userId) return;
    const unsub = useReportStore.subscribe((state, prev) => {
      // 只在 report 實際變化、且已 hydrate 完才寫
      if (!state.hydrated) return;
      if (state.report === prev.report) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const r = useReportStore.getState().report;
        void saveDraft(userId, r).then(() => {
          lastWriteRef.current = Date.now();
        });
      }, DEBOUNCE_MS);
    });
    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, userId]);
}
