"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowRight, Sparkles } from "lucide-react";

export interface ExistingClassMatch {
  classId: string;
  className: string;
  classCode: string | null;
  category: string | null;
  score: number;
}

export interface ExistingClassPanelProps {
  topScore: number;
  reuseRecommended: boolean;
  hasReferences: boolean;
  matches: ExistingClassMatch[];
  /** 培訓師選擇沿用某個既有班 */
  onReuse?: (classId: string) => void;
  /** 培訓師選擇繼續設計新班 */
  onContinueAsNew?: () => void;
  /** 是否已決定（決定後此面板可摺疊或淡化） */
  decided?: boolean;
}

export function ExistingClassPanel({
  topScore,
  reuseRecommended,
  hasReferences,
  matches,
  onReuse,
  onContinueAsNew,
  decided,
}: ExistingClassPanelProps) {
  if (!hasReferences && matches.length === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> 既有班搜尋
          </CardTitle>
          <CardDescription>
            沒找到相似既有班（最高分 {(topScore * 100).toFixed(0)}%），完全當新班處理。
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card
      className={
        reuseRecommended
          ? "border-amber-300 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20"
          : "border-slate-200 dark:border-slate-700"
      }
    >
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {reuseRecommended ? (
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          ) : (
            <Sparkles className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          )}
          既有班搜尋
        </CardTitle>
        <CardDescription>
          {reuseRecommended
            ? `找到高度相似既有班（最高 ${(topScore * 100).toFixed(0)}%），建議考慮直接沿用，不一定要設計新班。`
            : `找到中度相似的參考班（最高 ${(topScore * 100).toFixed(0)}%），會作為命名靈感參考。`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {matches.slice(0, 5).map((m) => (
            <li
              key={m.classId}
              className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-medium text-slate-800 dark:text-slate-100">{m.className}</span>
                  {m.classCode && (
                    <Badge variant="outline" className="text-[10px]">{m.classCode}</Badge>
                  )}
                  <Badge
                    className={
                      m.score >= 0.85
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                        : m.score >= 0.65
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    }
                  >
                    相似度 {(m.score * 100).toFixed(0)}%
                  </Badge>
                </div>
                {m.category && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">分類：{m.category}</div>
                )}
              </div>
              {!decided && reuseRecommended && onReuse && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onReuse(m.classId)}
                >
                  沿用此班
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              )}
            </li>
          ))}
        </ul>

        {!decided && reuseRecommended && onContinueAsNew && (
          <div className="pt-2 border-t flex justify-end">
            <Button size="sm" variant="ghost" onClick={onContinueAsNew}>
              我要設計新班
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
