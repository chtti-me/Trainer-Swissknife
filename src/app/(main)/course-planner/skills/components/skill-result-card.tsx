"use client";

/**
 * 單個 Skill 執行結果卡片
 *
 * 顯示：
 *   - 標題列：狀態、Skill 名、耗時、cached/429 標記
 *   - 推理（reasoning）摘要
 *   - 完整 JSON 輸出（可折疊）
 *   - 操作：複製 JSON、複製文字摘要、下載 .json
 */

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Loader2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import type { LlmSkillName } from "@/lib/course-planner/schemas/common";

export interface SkillResultCardProps {
  result: {
    skill: LlmSkillName;
    displayName: string;
    isAuxiliary: boolean;
    status: "pending" | "running" | "success" | "failed";
    output?: unknown;
    reasoning?: string;
    durationMs?: number;
    cached?: boolean;
    hit429?: boolean;
    error?: string;
  };
}

export function SkillResultCard({ result }: SkillResultCardProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(result.status === "success" && !result.isAuxiliary);

  const statusBadge = (() => {
    switch (result.status) {
      case "pending":
        return <Badge variant="outline" className="text-xs">待執行</Badge>;
      case "running":
        return (
          <Badge variant="outline" className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" /> 執行中
          </Badge>
        );
      case "success":
        return (
          <Badge variant="outline" className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3 mr-1" /> 完成
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="outline" className="text-xs bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">
            <XCircle className="h-3 w-3 mr-1" /> 失敗
          </Badge>
        );
    }
  })();

  const handleCopyJson = async () => {
    if (!result.output) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result.output, null, 2));
      toast(`${result.displayName} JSON 已複製`, "success");
    } catch {
      toast("複製失敗（瀏覽器權限）", "error");
    }
  };

  const handleDownloadJson = () => {
    if (!result.output) return;
    const blob = new Blob([JSON.stringify(result.output, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skill-${result.skill}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyReasoning = async () => {
    const text = `# ${result.displayName}\n\n推理：${result.reasoning ?? ""}\n\n---\n\n${JSON.stringify(
      result.output,
      null,
      2,
    )}`;
    try {
      await navigator.clipboard.writeText(text);
      toast("文字摘要已複製", "success");
    } catch {
      toast("複製失敗", "error");
    }
  };

  const canExpand = result.status === "success" || result.status === "failed";

  return (
    <div
      className={`rounded-lg border ${
        result.isAuxiliary
          ? "border-amber-200 dark:border-amber-800/40 bg-amber-50/30 dark:bg-amber-900/5"
          : "border-border bg-card"
      }`}
    >
      <button
        type="button"
        onClick={() => canExpand && setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left ${
          canExpand ? "hover:bg-muted/30 cursor-pointer" : "cursor-default"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {canExpand ? (
            open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />
          ) : (
            <span className="w-4" />
          )}
          <span className="font-medium text-sm">{result.displayName}</span>
          {result.isAuxiliary && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-400 text-amber-700 dark:text-amber-300">
              自動補跑
            </Badge>
          )}
          {result.cached && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-sky-400 text-sky-700 dark:text-sky-300">
              沿用既有
            </Badge>
          )}
          {result.hit429 && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-orange-400 text-orange-700 dark:text-orange-300">
              曾 429 退避
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {typeof result.durationMs === "number" && result.durationMs > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {(result.durationMs / 1000).toFixed(1)}s
            </span>
          )}
          {statusBadge}
        </div>
      </button>

      {open && canExpand && (
        <div className="border-t px-4 py-3 space-y-3">
          {result.status === "failed" && result.error && (
            <div className="rounded-md border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/10 p-3 text-xs text-rose-700 dark:text-rose-300 whitespace-pre-wrap">
              {result.error}
            </div>
          )}

          {result.reasoning && (
            <div className="text-xs">
              <span className="font-medium text-muted-foreground">推理依據：</span>{" "}
              <span className="text-foreground">{result.reasoning}</span>
            </div>
          )}

          {result.output !== undefined && (
            <>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleCopyJson} className="text-xs">
                  <Copy className="h-3 w-3 mr-1.5" /> 複製 JSON
                </Button>
                <Button size="sm" variant="outline" onClick={handleCopyReasoning} className="text-xs">
                  <Copy className="h-3 w-3 mr-1.5" /> 複製推理 + JSON
                </Button>
                <Button size="sm" variant="outline" onClick={handleDownloadJson} className="text-xs">
                  <Download className="h-3 w-3 mr-1.5" /> 下載 .json
                </Button>
              </div>

              <pre className="text-[11px] bg-muted/40 dark:bg-muted/20 rounded-md p-3 overflow-x-auto max-h-96 leading-relaxed">
                <code>{JSON.stringify(result.output, null, 2)}</code>
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
