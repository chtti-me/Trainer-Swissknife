"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History, Loader2, Download } from "lucide-react";
import { readResponseJson } from "@/lib/read-response-json";
import { useToast } from "@/components/ui/toaster";
import type { CoursePlanForm, AuxiliaryDocs } from "@/lib/course-planner/schemas/form";

export interface DraftRow {
  id: string;
  versionNo: number;
  formJson: CoursePlanForm;
  auxDocsJson: AuxiliaryDocs | null;
  changeNote: string | null;
  createdAt: string;
}

interface DraftVersionsPanelProps {
  requestId: string;
  /** 當前頁面 form 的版本號（用於高亮 Active） */
  activeVersionNo: number | null;
  /** 切換版本：把該版本的 formJson + auxDocsJson 載到頁面 */
  onLoadVersion: (form: CoursePlanForm, auxDocs: AuxiliaryDocs | null, versionNo: number) => void;
  /** 觸發重新載入（外部可控） */
  reloadTrigger?: number;
}

export function DraftVersionsPanel({
  requestId,
  activeVersionNo,
  onLoadVersion,
  reloadTrigger,
}: DraftVersionsPanelProps) {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/course-planner/requests/${requestId}/draft`);
      const data = await readResponseJson<{ drafts?: DraftRow[]; error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "載入版本失敗");
      setDrafts(data.drafts ?? []);
    } catch (e) {
      toast(e instanceof Error ? e.message : "載入失敗", "error");
    } finally {
      setLoading(false);
    }
  }, [requestId, toast]);

  useEffect(() => {
    void reload();
  }, [reload, reloadTrigger]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <History className="h-4 w-4 text-slate-500 dark:text-slate-400" /> 版本紀錄（{drafts.length}）
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> 載入中…
          </div>
        ) : drafts.length === 0 ? (
          <div className="text-xs text-slate-400 dark:text-slate-500">尚未儲存任何版本，按上方「儲存新版本」即可建立。</div>
        ) : (
          <ul className="space-y-1.5 max-h-72 overflow-auto">
            {drafts.map((d) => {
              const isActive = activeVersionNo === d.versionNo;
              return (
                <li
                  key={d.id}
                  className={`rounded-md border p-2 ${
                    isActive
                      ? "border-violet-400 bg-violet-50/50 dark:border-violet-700 dark:bg-violet-950/20"
                      : "border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 mb-0.5">
                        <Badge variant="outline" className="text-[10px]">v{d.versionNo}</Badge>
                        {isActive && <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200 text-[10px]">使用中</Badge>}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {new Date(d.createdAt).toLocaleString()}
                      </div>
                      {d.changeNote && (
                        <div className="text-xs text-slate-700 dark:text-slate-200 mt-1 line-clamp-2">{d.changeNote}</div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onLoadVersion(d.formJson, d.auxDocsJson, d.versionNo)}
                      disabled={isActive}
                      className="h-7 px-2"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      載入
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
