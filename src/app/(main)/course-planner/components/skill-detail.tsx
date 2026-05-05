"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brain, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import { SKILL_DISPLAY_NAMES, type LlmSkillName } from "@/lib/course-planner/schemas/common";

export interface SkillRunSummary {
  id: string;
  skillName: string;
  sequence: number;
  status: "running" | "success" | "failed";
  reasoning: string | null;
  output: unknown;
  error: string | null;
  durationMs: number | null;
  model: string | null;
  createdAt: string;
}

export interface SkillDetailProps {
  run: SkillRunSummary | null;
  onRerun?: (skill: LlmSkillName) => void;
  /** 目前正在重跑哪個 Skill（按下「重跑」之後到 SSE 接管前的過渡期） */
  rerunningSkill?: LlmSkillName | null;
}

function pickAssumptions(output: unknown): string[] | null {
  if (!output || typeof output !== "object") return null;
  const a = (output as { assumptions?: unknown }).assumptions;
  if (Array.isArray(a) && a.every((x) => typeof x === "string")) return a as string[];
  return null;
}
function pickConfidence(output: unknown): number | null {
  if (!output || typeof output !== "object") return null;
  const c = (output as { confidence?: unknown }).confidence;
  if (typeof c === "number") return c;
  return null;
}

export function SkillDetail({ run, onRerun, rerunningSkill }: SkillDetailProps) {
  if (!run) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
          點擊左側某個已完成的 Skill 來查看判斷依據與輸出細節。
        </CardContent>
      </Card>
    );
  }

  const display = SKILL_DISPLAY_NAMES[run.skillName as LlmSkillName] || run.skillName;
  const assumptions = pickAssumptions(run.output);
  const confidence = pickConfidence(run.output);
  const isRerunning = rerunningSkill === (run.skillName as LlmSkillName);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-violet-600 dark:text-violet-300" /> {display}
          </CardTitle>
          <div className="flex items-center gap-2">
            {run.status === "success" && (
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">成功</Badge>
            )}
            {run.status === "failed" && (
              <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">失敗</Badge>
            )}
            {run.status === "running" && (
              <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">執行中</Badge>
            )}
            {run.durationMs != null && (
              <span className="text-xs text-slate-400 dark:text-slate-500">{(run.durationMs / 1000).toFixed(1)}s</span>
            )}
            {onRerun && run.status !== "running" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRerun(run.skillName as LlmSkillName)}
                disabled={isRerunning}
                aria-busy={isRerunning}
                className={
                  isRerunning
                    ? "border-violet-400 bg-violet-100 text-violet-700 dark:border-violet-500 dark:bg-violet-900/40 dark:text-violet-200"
                    : ""
                }
              >
                {isRerunning ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" /> 啟動中…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1" /> 重跑
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1 flex-wrap">
          <span>第 {run.sequence} 次</span>
          {run.model && <span>模型 {run.model}</span>}
          {confidence != null && (
            <span>信心 {(confidence * 100).toFixed(0)}%</span>
          )}
          <span>{new Date(run.createdAt).toLocaleString()}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {run.error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <div className="whitespace-pre-wrap">{run.error}</div>
          </div>
        )}

        {run.reasoning && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
              AI 判斷依據
            </div>
            <div className="text-sm text-slate-800 bg-violet-50/50 border border-violet-200 dark:text-slate-100 dark:bg-violet-950/20 dark:border-violet-900/60 rounded-md p-3 whitespace-pre-wrap">
              {run.reasoning}
            </div>
          </div>
        )}

        {assumptions && assumptions.length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
              假設條件
            </div>
            <ul className="list-disc list-inside text-sm space-y-0.5 text-slate-700 dark:text-slate-200">
              {assumptions.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </div>
        )}

        <details className="text-xs">
          <summary className="cursor-pointer text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200">展開完整 output JSON</summary>
          <pre className="mt-2 bg-slate-900 text-slate-100 dark:bg-slate-950 dark:border dark:border-slate-800 rounded p-3 overflow-x-auto text-[11px] leading-relaxed">
            {JSON.stringify(run.output, null, 2)}
          </pre>
        </details>
      </CardContent>
    </Card>
  );
}
