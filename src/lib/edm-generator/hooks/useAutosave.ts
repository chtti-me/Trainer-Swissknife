/**
 * v0.7.5.0：useAutosave —— 訂閱 edmStore，debounced 寫入 DraftStorageAdapter。
 *
 * # 寫入策略
 *
 *   1) `subscribe` edmStore 任何變動 → 比對 snapshot 9 個欄位 → 任一不同則排程 flush
 *   2) Debounce 800 ms：使用者連續打字 / 拖移 block 期間不會頻繁寫入
 *   3) `visibilitychange` (tab 切換)、`beforeunload` (關閉視窗) → 立刻 flush
 *      ── 否則最後一筆編輯可能因為 debounce 還沒到期就被丟掉
 *   4) 失敗時更新 `useDraftStatusStore.setError(...)`；不 retry，下次有變動時自然會再寫
 *
 * # 為什麼不存 ref equal 而是 state snapshot
 *
 *   Zustand actions 多數會建新 array / object（spread），所以 reference 永遠不同；
 *   `snapshotsEqual` 對 9 個 reference 做淺比，足以判定「使用者沒在改文件」。
 */

import * as React from 'react';
import { useEdmStore } from '@edm/store/edmStore';
import { useDraftStatusStore } from '@edm/store/draftStatusStore';
import { getDraftStorageAdapter } from '@edm/lib/draft/registry';
import { extractSnapshot, snapshotsEqual } from '@edm/lib/draft/snapshot';
import { CURRENT_DRAFT_VERSION, type DraftPayload } from '@edm/lib/draft/types';
import { APP_VERSION } from '@edm/lib/version';
import type { EdmSnapshot } from '@edm/store/edmStore';

const AUTOSAVE_DEBOUNCE_MS = 800;

interface UseAutosaveOpts {
  /** 是否啟用；通常綁定「啟動還原流程是否完成」 */
  enabled: boolean;
}

export function useAutosave({ enabled }: UseAutosaveOpts): void {
  const setSaving = useDraftStatusStore((s) => s.setSaving);
  const setSaved = useDraftStatusStore((s) => s.setSaved);
  const setError = useDraftStatusStore((s) => s.setError);
  const setDisabled = useDraftStatusStore((s) => s.setDisabled);

  // 用 ref 暫存上次寫入的 snapshot reference + debounce timer
  const lastWrittenRef = React.useRef<EdmSnapshot | null>(null);
  const pendingTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushingRef = React.useRef(false);

  // adapter 整個 hook 生命週期內固定（不會切換）；ref 避免 effect deps
  const adapterRef = React.useRef(getDraftStorageAdapter());

  const flush = React.useCallback(async () => {
    if (flushingRef.current) return; // 上一輪還沒寫完，跳過（下一次 tick 會再來）
    const current = extractSnapshot();
    if (lastWrittenRef.current && snapshotsEqual(current, lastWrittenRef.current)) {
      return; // 沒實質變化（debounce window 內所有變動都被同一個 ref 吃掉）
    }
    flushingRef.current = true;
    setSaving();
    const payload: DraftPayload = {
      version: CURRENT_DRAFT_VERSION,
      savedAt: Date.now(),
      appVersion: APP_VERSION,
      snapshot: current,
    };
    try {
      await adapterRef.current.write(payload);
      lastWrittenRef.current = current;
      setSaved(payload.savedAt);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      flushingRef.current = false;
    }
  }, [setSaving, setSaved, setError]);

  const schedule = React.useCallback(() => {
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null;
      void flush();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [flush]);

  React.useEffect(() => {
    if (!enabled) return;
    const adapter = adapterRef.current;
    const desc = adapter.describe();
    if (!desc.supportsAutosave) {
      setDisabled();
      return;
    }

    // 訂閱 edmStore 變動
    const unsub = useEdmStore.subscribe(() => {
      schedule();
    });

    // 標籤切換 / 關閉時立刻 flush
    const onBeforeUnload = () => {
      // 同步取消 timer（瀏覽器在 beforeunload 後可能不執行 microtask；
      // 至少把 pending 寫入啟動）
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      void flush();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (pendingTimerRef.current) {
          clearTimeout(pendingTimerRef.current);
          pendingTimerRef.current = null;
        }
        void flush();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      unsub();
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
    };
  }, [enabled, schedule, flush, setDisabled]);
}
