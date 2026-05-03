/**
 * v0.7.5.0：useRestoreDraft —— 啟動時試還原 autosave。
 *
 * # 流程
 *
 *   1) Mount 時呼叫 adapter.read()
 *   2) status === 'ok' 且宿主沒指定 initialPlan/initialTemplateId/initialPaletteId
 *      → 呼叫 useEdmStore.restoreFromDraft(payload.snapshot) + 顯示「已恢復」toast
 *   3) status === 'ok' 但宿主有 initial* → 略過（宿主明確需求 > 使用者上次草稿；
 *      但 draft 不刪 —— 使用者可能下次開回獨立模式時又要它）
 *   4) status === 'incompatible' / 'corrupt' → log + 清空 draft（避免下次再炸）
 *   5) 設 ready=true，autosave 才開始訂閱寫入
 *
 * # 為什麼不直接整合進 useApplyInitialState
 *
 *   - useApplyInitialState 是同步 effect；本 hook 是 async（read() 是 Promise）
 *   - 兩者語意正交：宿主 init = 顯式注入；autosave restore = 隱式還原
 *   - 分開可獨立測試 / 替換
 */

import * as React from 'react';
import { useEdmStore } from '@edm/store/edmStore';
import { useHostConfigStore } from '@edm/store/hostConfigStore';
import { useDraftStatusStore } from '@edm/store/draftStatusStore';
import { getDraftStorageAdapter } from '@edm/lib/draft/registry';
import { toast } from '@edm/components/ui/toast';

interface UseRestoreDraftResult {
  /** 還原流程已完成（成功 / 沒草稿 / 失敗都算）；autosave 訂閱要等這個變 true */
  ready: boolean;
}

function formatRelative(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec} 秒前`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const day = Math.round(hr / 24);
  return `${day} 天前`;
}

export function useRestoreDraft(): UseRestoreDraftResult {
  const [ready, setReady] = React.useState(false);
  const setRestoredFrom = useDraftStatusStore((s) => s.setRestoredFrom);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const adapter = getDraftStorageAdapter();
      const desc = adapter.describe();
      // adapter 不支援 → 直接 ready，不用嘗試還原
      if (!desc.supportsAutosave) {
        if (!cancelled) {
          setRestoredFrom('none');
          setReady(true);
        }
        return;
      }

      const result = await adapter.read();
      if (cancelled) return;

      if (result.status === 'empty') {
        setRestoredFrom('none');
        setReady(true);
        return;
      }

      if (result.status === 'incompatible' || result.status === 'corrupt') {
        // log 但不擾民；清掉壞 payload 避免下次又炸
        const reason =
          result.status === 'incompatible'
            ? `payload 版本不相容（rawVersion=${result.rawVersion}）`
            : `payload 解析失敗：${result.error}`;
        console.warn(`[autosave] 略過上次草稿：${reason}`);
        try {
          await adapter.clear();
        } catch {
          // 連 clear 都失敗就放著，下次還原再試
        }
        setRestoredFrom('none');
        setReady(true);
        return;
      }

      // 宿主有明確 initialPlan → 不還原 draft（宿主需求優先），但保留 draft
      const cfg = useHostConfigStore.getState().config;
      if (cfg.initialPlan || cfg.initialTemplateId || cfg.initialPaletteId) {
        setRestoredFrom('host');
        setReady(true);
        return;
      }

      // 還原
      useEdmStore.getState().restoreFromDraft(result.payload.snapshot);
      setRestoredFrom('autosave');

      const when = formatRelative(result.payload.savedAt);
      toast({
        title: '已恢復上次未完成的內容',
        description: `最後儲存：${when}。如要重新開始，請使用 Topbar 的「重置 EDM」`,
        variant: 'success',
        duration: 6000,
      });

      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // 故意空依賴：只在 mount 時還原一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ready };
}
