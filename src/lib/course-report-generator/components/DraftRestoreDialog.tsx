"use client";

/**
 * 【草稿還原對話框】
 * 進入頁面時，若 IDB 內找到草稿，跳出對話框讓使用者選「載入草稿 / 開新報告」。
 */
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2, FilePlus, FileText } from "lucide-react";
import type { CourseReport } from "../types/report";

interface Props {
  open: boolean;
  draft: CourseReport | null;
  onLoad: () => void;
  onNew: () => void;
}

export function DraftRestoreDialog({ open, draft, onLoad, onNew }: Props) {
  if (!draft) return null;
  const updated = draft.updatedAt ? new Date(draft.updatedAt).toLocaleString("zh-TW") : "—";
  const sessionsCount = draft.design?.sessions?.length ?? 0;
  const benefitsCount = draft.benefits?.length ?? 0;

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>偵測到上次的草稿</DialogTitle>
          <DialogDescription>
            是否要繼續上次的編輯？開新報告會清除目前的草稿。
          </DialogDescription>
        </DialogHeader>
        <div className="my-3 space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <span className="font-medium">{draft.title || "（未命名草稿）"}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            最後編輯：{updated}
          </div>
          <div className="text-xs text-muted-foreground">
            模板：{draft.templateId} ｜ 節次：{sessionsCount} ｜ 效益：{benefitsCount}
          </div>
        </div>
        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onNew} className="gap-2">
            <Trash2 className="h-4 w-4" /> 開新報告（捨棄草稿）
          </Button>
          <Button onClick={onLoad} className="gap-2">
            <FilePlus className="h-4 w-4" /> 載入草稿繼續編輯
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
