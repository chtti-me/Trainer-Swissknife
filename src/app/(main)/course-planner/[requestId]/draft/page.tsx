"use client";

/**
 * 課程規劃幫手 — 開班計畫表（草案）頁
 *
 * 路由：/course-planner/[requestId]/draft
 *
 * 與「進度頁（[requestId]/page.tsx）」分頁切開：
 *   - 進度頁負責「執行 11 個 Skill / 看每個 Skill 的判斷依據與重跑」
 *   - 本頁負責「編輯開班計畫表草案、輔助文件、版本記錄、匯出」
 *
 * 排版：
 *   - 上：開班計畫表（草案）— 使用整頁完整寬度
 *   - 下左 75%：輔助文件（4 份不會進開班計畫表的素材）
 *   - 下右 25%：版本記錄
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { UserTray } from "@/components/layout/user-tray";
import {
  Loader2,
  ArrowLeft,
  Save,
  RefreshCw,
  Download,
  FileText,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { readResponseJson } from "@/lib/read-response-json";
import { useToast } from "@/components/ui/toaster";
import {
  emptyCoursePlanForm,
  emptyAuxiliaryDocs,
  type CoursePlanForm,
  type AuxiliaryDocs,
} from "@/lib/course-planner/schemas/form";
import { CoursePlanFormView } from "../../components/course-plan-form-view";
import { AuxiliaryDocsPanel } from "../../components/auxiliary-docs-panel";
import { DraftVersionsPanel } from "../../components/draft-versions-panel";

interface RequestDetail {
  id: string;
  title: string | null;
  status: string;
  finalForm: CoursePlanForm | null;
  finalAuxDocs: AuxiliaryDocs | null;
}

export default function CoursePlanDraftPage() {
  const params = useParams<{ requestId: string }>();
  const requestId = params.requestId;
  const router = useRouter();
  const { toast } = useToast();

  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [form, setForm] = useState<CoursePlanForm>(emptyCoursePlanForm());
  const [auxDocs, setAuxDocs] = useState<AuxiliaryDocs>(emptyAuxiliaryDocs());
  const [savingDraft, setSavingDraft] = useState(false);
  const [pendingPatch, setPendingPatch] = useState(false);
  const [activeVersionNo, setActiveVersionNo] = useState<number | null>(null);
  const [versionsReloadTick, setVersionsReloadTick] = useState(0);
  const [changeNote, setChangeNote] = useState("");

  // 內聯重新命名
  const [editingTitle, setEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);

  const loadRequest = useCallback(async () => {
    try {
      const res = await fetch(`/api/course-planner/requests/${requestId}`);
      const data = await readResponseJson<{ request?: RequestDetail; error?: string }>(res);
      if (!res.ok || !data.request) throw new Error(data.error || "載入失敗");
      setRequest(data.request);
      if (data.request.finalForm) setForm(data.request.finalForm);
      if (data.request.finalAuxDocs) setAuxDocs(data.request.finalAuxDocs);
    } catch (e) {
      toast(e instanceof Error ? e.message : "載入規劃需求失敗", "error");
    }
  }, [requestId, toast]);

  useEffect(() => {
    void loadRequest();
  }, [loadRequest]);

  const handleSaveDraftVersion = async () => {
    setSavingDraft(true);
    try {
      const res = await fetch(`/api/course-planner/requests/${requestId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form, auxDocs, changeNote: changeNote.trim() || null }),
      });
      const data = await readResponseJson<{ draft?: { versionNo: number }; error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "存檔失敗");
      toast(`已儲存版本 v${data.draft?.versionNo ?? "?"}`, "success");
      setChangeNote("");
      setActiveVersionNo(data.draft?.versionNo ?? null);
      setVersionsReloadTick((n) => n + 1);
      await loadRequest();
    } catch (e) {
      toast(e instanceof Error ? e.message : "存檔失敗", "error");
    } finally {
      setSavingDraft(false);
    }
  };

  const handleLoadVersion = (
    nextForm: CoursePlanForm,
    nextAux: AuxiliaryDocs | null,
    versionNo: number,
  ) => {
    setForm(nextForm);
    if (nextAux) setAuxDocs(nextAux);
    setActiveVersionNo(versionNo);
    toast(`已載入 v${versionNo}（記得按「快存」或「儲存新版本」才會寫回）`, "info");
  };

  const handlePatchToRequest = async () => {
    setPendingPatch(true);
    try {
      const res = await fetch(`/api/course-planner/requests/${requestId}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form, auxDocs }),
      });
      const data = await readResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "更新失敗");
      toast("已更新草案", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "更新失敗", "error");
    } finally {
      setPendingPatch(false);
    }
  };

  // ---------- 內聯重新命名 ----------
  const beginEditTitle = () => {
    setTempTitle(request?.title ?? "");
    setEditingTitle(true);
  };
  const cancelEditTitle = () => {
    setEditingTitle(false);
    setTempTitle("");
  };
  const saveTitle = async () => {
    const next = tempTitle.trim();
    if (next === (request?.title ?? "")) {
      setEditingTitle(false);
      return;
    }
    if (next.length === 0) {
      toast("標題不可為空", "error");
      return;
    }
    setSavingTitle(true);
    try {
      const res = await fetch(`/api/course-planner/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      const data = await readResponseJson<{ request?: RequestDetail; error?: string }>(res);
      if (!res.ok || !data.request) throw new Error(data.error || "儲存失敗");
      setRequest((prev) => (prev ? { ...prev, title: data.request!.title } : prev));
      toast("已重新命名", "success");
      setEditingTitle(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "儲存失敗", "error");
    } finally {
      setSavingTitle(false);
    }
  };

  if (!request) {
    return (
      <div className="flex items-center gap-2 p-8 text-slate-500 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> 載入規劃需求中…
      </div>
    );
  }

  // 還沒跑完規劃就點進來
  if (request.status !== "completed" || !request.finalForm) {
    return (
      <div className="space-y-4">
        <Link
          href={`/course-planner/${requestId}`}
          className="text-sm text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-300 inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> 返回執行時間軸
        </Link>
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
          <FileText className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-1">
            開班計畫表（草案）尚未產出
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            目前 request 狀態為「{request.status}」，請先回到執行時間軸完成 11 個 Skill。
          </p>
          <Button onClick={() => router.push(`/course-planner/${requestId}`)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> 回到執行時間軸
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link
          href={`/course-planner/${requestId}`}
          className="text-sm text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-300 inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> 返回執行時間軸
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            type="text"
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            placeholder="（選填）此版本的變更說明"
            className="text-sm w-56 h-9"
          />
          <Button variant="outline" onClick={handlePatchToRequest} disabled={pendingPatch}>
            {pendingPatch ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            快存
          </Button>
          <Button onClick={handleSaveDraftVersion} disabled={savingDraft}>
            {savingDraft ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            儲存新版本
          </Button>
          <ExportMenu requestId={requestId} />
          <UserTray />
        </div>
      </div>

      {/* 內聯可編輯標題 */}
      <div>
        {editingTitle ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={tempTitle}
              onChange={(e) => setTempTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveTitle();
                else if (e.key === "Escape") cancelEditTitle();
              }}
              placeholder="輸入規劃標題"
              maxLength={40}
              className="text-2xl font-bold h-auto py-1.5"
            />
            <Button size="sm" onClick={() => void saveTitle()} disabled={savingTitle}>
              {savingTitle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="outline" onClick={cancelEditTitle} disabled={savingTitle}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="group flex items-center gap-2">
            <h1 className="text-2xl font-bold break-normal">
              {request.title || (
                <span className="text-slate-400 dark:text-slate-500">（未命名規劃）</span>
              )}
            </h1>
            <span className="text-sm font-normal text-slate-400 dark:text-slate-500">
              · 開班計畫表（草案）
            </span>
            <button
              type="button"
              onClick={beginEditTitle}
              className="rounded p-1 text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30 opacity-0 group-hover:opacity-100 transition"
              title="重新命名"
              aria-label="重新命名"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          已完成
        </Badge>
        {activeVersionNo != null && (
          <Badge variant="outline">目前載入版本：v{activeVersionNo}</Badge>
        )}
      </div>

      {/* 上：開班計畫表 — 完整寬度 */}
      <div>
        <CoursePlanFormView form={form} onChange={setForm} />
      </div>

      {/* 下：輔助文件 75% + 版本記錄 25% */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-9">
          <AuxiliaryDocsPanel docs={auxDocs} />
        </div>
        <div className="col-span-12 lg:col-span-3">
          <DraftVersionsPanel
            requestId={requestId}
            activeVersionNo={activeVersionNo}
            onLoadVersion={handleLoadVersion}
            reloadTrigger={versionsReloadTick}
          />
        </div>
      </div>
    </div>
  );
}

function ExportMenu({ requestId }: { requestId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const { toast } = useToast();
  const formats: Array<{ key: "markdown" | "html" | "json" | "docx"; label: string }> = [
    { key: "markdown", label: "Markdown" },
    { key: "html", label: "HTML" },
    { key: "json", label: "JSON" },
    { key: "docx", label: "Word (.docx)" },
  ];
  const handleExport = async (format: "markdown" | "html" | "json" | "docx") => {
    setBusy(format);
    try {
      const res = await fetch(`/api/course-planner/requests/${requestId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt.slice(0, 200));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `course-plan-${requestId}.${format === "markdown" ? "md" : format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast(e instanceof Error ? e.message : "匯出失敗", "error");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="relative">
      <details className="inline-block">
        <summary className="list-none cursor-pointer">
          <Button variant="outline" asChild>
            <span>
              <Download className="h-4 w-4 mr-1" /> 匯出
            </span>
          </Button>
        </summary>
        <div className="absolute right-0 mt-1 z-10 rounded-md border bg-white dark:bg-slate-900 dark:border-slate-700 shadow-md min-w-[140px]">
          {formats.map((f) => (
            <button
              key={f.key}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              onClick={() => handleExport(f.key)}
              disabled={busy != null}
            >
              {busy === f.key ? "匯出中…" : f.label}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
