"use client";

/**
 * 【課程規劃報告產生器 - 主元件】
 *
 * 職責：
 *   - 進入頁面時，從 IndexedDB 嘗試載入草稿；若有 → 跳對話框；無 → 直接 hydrate 空白
 *   - 啟動 autosave（debounce）
 *   - 把 userId 傳給下層
 */
import * as React from "react";
import { AppShell } from "./components/AppShell";
import { DraftRestoreDialog } from "./components/DraftRestoreDialog";
import {
  createEmptyReport,
  useReportStore,
} from "./store/reportStore";
import { useAutosave } from "./store/autosave";
import { loadDraft, deleteDraft } from "./lib/storage/idb";
import type { CourseReport } from "./types/report";

interface Props {
  userId: string;
  defaultReporter?: string;
  defaultDepartment?: string;
}

export function CourseReportGenerator({ userId, defaultReporter, defaultDepartment }: Props) {
  const hydrate = useReportStore((s) => s.hydrate);
  const hydrated = useReportStore((s) => s.hydrated);

  const [draft, setDraft] = React.useState<CourseReport | null>(null);
  const [showDraftDialog, setShowDraftDialog] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  // 一次性嘗試載入草稿
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const d = await loadDraft(userId);
        if (!mounted) return;
        if (d && d.schemaVersion === 1) {
          setDraft(d);
          setShowDraftDialog(true);
        } else {
          hydrate(createEmptyReport(defaultReporter, defaultDepartment));
        }
      } catch (err) {
        console.warn("[course-report] loadDraft 失敗，改用空白：", err);
        hydrate(createEmptyReport(defaultReporter, defaultDepartment));
      } finally {
        if (mounted) setLoaded(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userId, hydrate, defaultReporter, defaultDepartment]);

  useAutosave(userId, hydrated);

  const handleLoad = () => {
    if (!draft) return;
    hydrate(draft);
    setShowDraftDialog(false);
  };
  const handleNew = async () => {
    await deleteDraft(userId);
    hydrate(createEmptyReport(defaultReporter, defaultDepartment));
    setShowDraftDialog(false);
  };

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        載入中…
      </div>
    );
  }

  return (
    <>
      <AppShell userId={userId} />
      <DraftRestoreDialog open={showDraftDialog} draft={draft} onLoad={handleLoad} onNew={handleNew} />
    </>
  );
}
