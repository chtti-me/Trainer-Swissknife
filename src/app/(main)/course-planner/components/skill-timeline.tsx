"use client";

import { CheckCircle2, Loader2, Circle, AlertCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SKILL_DISPLAY_NAMES,
  SKILL_PIPELINE_ORDER,
  type LlmSkillName,
  type SkillName,
} from "@/lib/course-planner/schemas/common";

export type SkillStatus = "pending" | "running" | "success" | "failed";

export interface SkillTimelineProps {
  /** 當前正在跑的 Skill（含 existing_lookup） */
  currentSkill: SkillName | null;
  /** 已完成 / 失敗 / 跑過的 Skill 狀態 map */
  skillStates: Partial<Record<SkillName, SkillStatus>>;
  /** 點擊某個已完成 Skill 時的 callback（顯示 reasoning + output） */
  onSelectSkill?: (skill: LlmSkillName) => void;
  /** 高亮目前選中的 Skill */
  selectedSkill?: LlmSkillName | null;
}

const PIPELINE: SkillName[] = ["existing_lookup", ...SKILL_PIPELINE_ORDER];

function getIcon(status: SkillStatus | undefined, isCurrent: boolean) {
  if (status === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "failed") return <AlertCircle className="h-4 w-4 text-rose-500" />;
  if (status === "running" || isCurrent) return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
  return <Circle className="h-4 w-4 text-slate-300" />;
}

export function SkillTimeline({
  currentSkill,
  skillStates,
  onSelectSkill,
  selectedSkill,
}: SkillTimelineProps) {
  return (
    <ol className="space-y-1">
      {PIPELINE.map((skill, idx) => {
        const status = skillStates[skill];
        const isCurrent = currentSkill === skill;
        const isExisting = skill === "existing_lookup";
        const isClickable = !isExisting && onSelectSkill && (status === "success" || status === "failed");
        const isSelected = selectedSkill === skill;
        return (
          <li
            key={skill}
            className={cn(
              "group rounded-lg border px-3 py-2 transition",
              isSelected
                ? "border-violet-500 bg-violet-50/60 dark:bg-violet-900/20 ring-1 ring-violet-300 dark:ring-violet-700"
                : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-900",
              isClickable ? "cursor-pointer" : "cursor-default",
            )}
            onClick={() => {
              if (isClickable) onSelectSkill?.(skill as LlmSkillName);
            }}
          >
            <div className="flex items-center gap-2">
              <div className="flex-shrink-0">
                {isExisting ? (
                  status === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : status === "running" || isCurrent ? (
                    <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                  )
                ) : (
                  getIcon(status, isCurrent)
                )}
              </div>
              <div className="flex-1">
                <div className="text-xs text-slate-400 dark:text-slate-500">
                  {isExisting ? "前置" : `Skill ${idx}`}
                </div>
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100 break-all leading-snug">
                  {SKILL_DISPLAY_NAMES[skill]}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
