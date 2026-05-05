"use client";

/**
 * 課程規劃幫手 — 進度頁
 *
 * 三大區塊：
 *   1. 左側 Skill 時間軸（含 existing_lookup 前置 + 11 Skills）
 *   2. 中間主預覽：SkillDetail（最近執行／點選的 Skill）
 *   3. 右側：ExistingClassPanel（既有班沿用判斷）
 *
 * 功能：
 *   - URL ?autostart=1 進來自動觸發 SSE pipeline
 *   - SSE 收到 skill_complete 即時更新 timeline + skill detail
 *   - SSE 收到 title_updated 即時更新標題（auto-title）
 *   - 跑完後顯示「查看開班計畫表（草案）」大按鈕，轉頁到 /draft 編輯／匯出
 *   - 點 Skill 重跑會自動帶下游；按下時立即顯示「啟動中…」+ Toast
 *   - 標題可內聯重新命名（PATCH /requests/[id]）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { UserTray } from "@/components/layout/user-tray";
import {
  Loader2,
  ArrowLeft,
  Play,
  ListVideo,
  Pencil,
  Check,
  X,
  FileText,
  ArrowRight,
} from "lucide-react";
import { readResponseJson } from "@/lib/read-response-json";
import { useToast } from "@/components/ui/toaster";
import {
  type LlmSkillName,
  type SkillName,
  SKILL_DISPLAY_NAMES,
  SKILL_PIPELINE_ORDER,
} from "@/lib/course-planner/schemas/common";
import { SkillTimeline, type SkillStatus } from "../components/skill-timeline";
import { SkillDetail, type SkillRunSummary } from "../components/skill-detail";
import { ExistingClassPanel, type ExistingClassMatch } from "../components/existing-class-panel";

interface RequestDetail {
  id: string;
  title: string | null;
  status: string;
  currentSkill: string | null;
  reuseClassId: string | null;
  rawInputText: string;
  aiProvider: string | null;
}

const PROVIDER_OPTIONS_DETAIL: { value: string; label: string }[] = [
  { value: "", label: "預設（依 .env）" },
  { value: "gemini", label: "Gemini 2.5 Flash" },
  { value: "groq", label: "Groq llama-3.3-70b" },
  { value: "openai", label: "OpenAI gpt-4o-mini" },
];

type OrchEvent =
  | { type: "request_started"; requestId: string }
  | { type: "title_updated"; title: string }
  | {
      type: "existing_lookup_complete";
      topScore: number;
      reuseRecommended: boolean;
      hasReferences: boolean;
      matches: ExistingClassMatch[];
    }
  | { type: "skill_start"; skill: SkillName; displayName: string }
  | {
      type: "skill_complete";
      skill: SkillName;
      displayName: string;
      output: unknown;
      reasoning: string;
      durationMs: number;
      cached?: boolean;
      hit429?: boolean;
    }
  | { type: "skill_failed"; skill: SkillName; displayName: string; error: string }
  | { type: "complete" }
  | { type: "error"; message: string };

export default function RequestDetailPage() {
  const params = useParams<{ requestId: string }>();
  const requestId = params.requestId;
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [skillStates, setSkillStates] = useState<Partial<Record<SkillName, SkillStatus>>>({});
  const [currentSkill, setCurrentSkill] = useState<SkillName | null>(null);
  const [skillRuns, setSkillRuns] = useState<SkillRunSummary[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<LlmSkillName | null>(null);
  const [running, setRunning] = useState(false);
  const [existingMatches, setExistingMatches] = useState<{
    topScore: number;
    reuseRecommended: boolean;
    hasReferences: boolean;
    matches: ExistingClassMatch[];
  } | null>(null);
  const [reuseDecided, setReuseDecided] = useState(false);
  const [changingProvider, setChangingProvider] = useState(false);
  const [rerunningSkill, setRerunningSkill] = useState<LlmSkillName | null>(null);

  // 內聯重新命名
  const [editingTitle, setEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [navigatingToDraft, setNavigatingToDraft] = useState(false);

  const autostartRef = useRef(false);

  const loadRequest = useCallback(async () => {
    try {
      const res = await fetch(`/api/course-planner/requests/${requestId}`);
      const data = await readResponseJson<{ request?: RequestDetail; error?: string }>(res);
      if (!res.ok || !data.request) throw new Error(data.error || "載入失敗");
      setRequest(data.request);
      if (data.request.reuseClassId) setReuseDecided(true);
    } catch (e) {
      toast(e instanceof Error ? e.message : "載入規劃需求失敗", "error");
    }
  }, [requestId, toast]);

  const loadSkillRuns = useCallback(async () => {
    try {
      const res = await fetch(`/api/course-planner/requests/${requestId}/skills`);
      const data = await readResponseJson<{ runs?: SkillRunSummary[]; error?: string }>(res);
      if (!res.ok) return;
      const runs = data.runs ?? [];
      setSkillRuns(runs);
      const states: Partial<Record<SkillName, SkillStatus>> = {};
      for (const r of runs) {
        states[r.skillName as SkillName] = r.status as SkillStatus;
      }
      setSkillStates((prev) => ({ ...prev, ...states }));
    } catch (e) {
      console.error(e);
    }
  }, [requestId]);

  useEffect(() => {
    void loadRequest();
    void loadSkillRuns();
  }, [loadRequest, loadSkillRuns]);

  // ---------- SSE pipeline runner ----------
  const runStream = useCallback(
    async (url: string, body: Record<string, unknown>) => {
      setRunning(true);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok || !res.body) {
          const errorBody = await res.text();
          throw new Error(`啟動 pipeline 失敗：${errorBody.slice(0, 200)}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const event = JSON.parse(data) as OrchEvent;
              handleEvent(event);
            } catch (e) {
              console.warn("SSE parse failed", e, data);
            }
          }
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : "Pipeline 失敗", "error");
      } finally {
        setRunning(false);
        setRerunningSkill(null);
        await loadSkillRuns();
        await loadRequest();
      }
    },
    [loadRequest, loadSkillRuns, toast],
  );

  function handleEvent(event: OrchEvent) {
    switch (event.type) {
      case "request_started":
        break;
      case "title_updated":
        setRequest((prev) => (prev ? { ...prev, title: event.title } : prev));
        toast(`已自動命名：${event.title}`, "info");
        break;
      case "existing_lookup_complete":
        setExistingMatches({
          topScore: event.topScore,
          reuseRecommended: event.reuseRecommended,
          hasReferences: event.hasReferences,
          matches: event.matches,
        });
        setSkillStates((prev) => ({ ...prev, existing_lookup: "success" }));
        setCurrentSkill(null);
        break;
      case "skill_start":
        setSkillStates((prev) => ({ ...prev, [event.skill]: "running" }));
        setCurrentSkill(event.skill);
        // SSE 已接管，過渡期 spinner 任務交給 timeline / detail 的「執行中」狀態
        if (rerunningSkill === event.skill) setRerunningSkill(null);
        break;
      case "skill_complete":
        setSkillStates((prev) => ({ ...prev, [event.skill]: "success" }));
        setCurrentSkill(null);
        setSkillRuns((prev) => {
          const others = prev.filter((p) => p.skillName !== event.skill);
          return [
            ...others,
            {
              id: `live-${event.skill}-${Date.now()}`,
              skillName: event.skill,
              sequence: 1,
              status: "success",
              reasoning: event.reasoning,
              output: event.output,
              error: null,
              durationMs: event.durationMs,
              model: null,
              createdAt: new Date().toISOString(),
            },
          ];
        });
        if (!selectedSkill) setSelectedSkill(event.skill as LlmSkillName);
        if (event.cached) {
          toast(`${event.displayName} 走快取（input 未變，省一次 LLM 呼叫）`, "success");
        }
        break;
      case "skill_failed":
        setSkillStates((prev) => ({ ...prev, [event.skill]: "failed" }));
        setCurrentSkill(null);
        toast(`${event.displayName} 失敗：${event.error}`, "error");
        break;
      case "complete":
        toast("11 個 Skill 全部完成，開班計畫表草案已產出！", "success");
        break;
      case "error":
        toast(event.message, "error");
        break;
    }
  }

  // ---------- Auto-start on first load if ?autostart=1 ----------
  useEffect(() => {
    if (autostartRef.current) return;
    if (!request) return;
    if (request.status !== "pending") return;
    if (searchParams.get("autostart") !== "1") return;
    autostartRef.current = true;
    const hours = searchParams.get("hours");
    const days = searchParams.get("days");
    void runStream(`/api/course-planner/requests/${requestId}/run`, {
      preferredTotalHours: hours ? Number(hours) : undefined,
      preferredDays: days ? Number(days) : undefined,
    });
  }, [request, requestId, runStream, searchParams]);

  // ---------- handlers ----------
  const handleManualStart = () => {
    void runStream(`/api/course-planner/requests/${requestId}/run`, {});
  };

  const handleChangeAiProvider = async (raw: string) => {
    if (running) {
      toast("Pipeline 跑完後才能切換執行引擎", "error");
      return;
    }
    setChangingProvider(true);
    try {
      const res = await fetch(`/api/course-planner/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiProvider: raw === "" ? null : raw }),
      });
      const data = await readResponseJson<{ request?: RequestDetail; error?: string }>(res);
      if (!res.ok || !data.request) throw new Error(data.error || "切換失敗");
      setRequest((prev) => (prev ? { ...prev, aiProvider: data.request!.aiProvider } : prev));
      const label = raw === "" ? "預設（依 .env）" : raw;
      toast(`執行引擎已切換為 ${label}；下次重跑會生效`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "切換失敗", "error");
    } finally {
      setChangingProvider(false);
    }
  };

  const handleRerun = async (skill: LlmSkillName) => {
    // P3：先打 check-rerun 看上次結果還在不在、上游是否動過。
    let forceRerun = false;
    try {
      const res = await fetch(
        `/api/course-planner/requests/${requestId}/skills/${skill}/check-rerun`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          canSkip?: boolean;
          reason?: string;
          lastRunAt?: string | null;
          lastDurationMs?: number | null;
          lastSequence?: number;
        };
        if (data.canSkip) {
          const lastTime = data.lastRunAt ? new Date(data.lastRunAt).toLocaleString() : "（未知時間）";
          const dur =
            typeof data.lastDurationMs === "number"
              ? `（耗時 ${(data.lastDurationMs / 1000).toFixed(1)}s）`
              : "";
          const seqText = typeof data.lastSequence === "number" ? `第 ${data.lastSequence} 次` : "上次";
          const ok = window.confirm(
            `${seqText}的結果還在 ${dur}\n上次跑於：${lastTime}\n\n` +
              `偵測到上游 Skill 從那之後沒有改動，這次重跑很可能會直接讀回上次結果（不會耗 token）。\n\n` +
              `按【確定】＝強制重新呼叫 LLM；\n按【取消】＝先不動，跳出此對話。`,
          );
          if (!ok) return;
          forceRerun = true;
        }
      }
    } catch {
      // check-rerun 失敗不阻擋；fall through 直接跑
    }

    // 確認動作後立即給視覺回饋
    const displayName = SKILL_DISPLAY_NAMES[skill] ?? skill;
    setRerunningSkill(skill);
    toast(`即將開始重新執行「${displayName}」`, "info");
    void runStream(`/api/course-planner/requests/${requestId}/skills/${skill}/run`, { forceRerun });
  };

  const handleReuseClass = async (classId: string) => {
    try {
      const res = await fetch(`/api/course-planner/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reuseClassId: classId, status: "reuse_existing" }),
      });
      const data = await readResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "更新失敗");
      setReuseDecided(true);
      toast("已標記為「沿用既有班」，跳過設計新班", "success");
      await loadRequest();
    } catch (e) {
      toast(e instanceof Error ? e.message : "更新失敗", "error");
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

  // ---------- selected skill detail ----------
  const selectedRun = useMemo(() => {
    if (!selectedSkill) {
      const successful = skillRuns.filter((r) => r.status === "success");
      if (successful.length === 0) return null;
      const order = SKILL_PIPELINE_ORDER as readonly string[];
      successful.sort((a, b) => order.indexOf(b.skillName) - order.indexOf(a.skillName));
      return successful[0];
    }
    return skillRuns.find((r) => r.skillName === selectedSkill) ?? null;
  }, [selectedSkill, skillRuns]);

  const pipelineComplete =
    skillStates.needs === "success" &&
    skillStates.outline === "success" &&
    skillStates.schedule === "success" &&
    request?.status === "completed";

  if (!request) {
    return (
      <div className="flex items-center gap-2 p-8 text-slate-500 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> 載入規劃需求中…
      </div>
    );
  }

  const showRightCol = existingMatches != null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link
            href="/course-planner"
            className="text-sm text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-300 inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> 返回課程規劃幫手
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {!running && request.status === "pending" && (
            <Button onClick={handleManualStart}>
              <Play className="h-4 w-4 mr-1" /> 開始規劃
            </Button>
          )}
          {pipelineComplete && (
            <Button
              onClick={() => {
                if (navigatingToDraft) return;
                setNavigatingToDraft(true);
                toast("正在開啟開班計畫表草案頁面…", "info");
                router.push(`/course-planner/${requestId}/draft`);
              }}
              disabled={navigatingToDraft}
              aria-busy={navigatingToDraft}
              className="bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-80"
            >
              {navigatingToDraft ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" /> 開啟中…
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-1" /> 查看開班計畫表（草案）
                  <ArrowRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          )}
          <UserTray />
        </div>
      </div>

      {/* 內聯可編輯標題 */}
      <div className="mb-2">
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
              placeholder="輸入規劃標題（12~22 字）"
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

      <div className="flex items-center gap-2 flex-wrap mb-2">
        <Badge variant="outline">狀態：{request.status}</Badge>
        {request.currentSkill && (
          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            執行中：{SKILL_DISPLAY_NAMES[request.currentSkill as SkillName] ?? request.currentSkill}
          </Badge>
        )}
        {running && (
          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 inline-flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> SSE 串流中
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1.5 text-xs">
          <span className="text-slate-500 dark:text-slate-400">執行引擎</span>
          <select
            value={request.aiProvider ?? ""}
            onChange={(e) => void handleChangeAiProvider(e.target.value)}
            disabled={running || changingProvider}
            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50"
            title="跑 pipeline 時不可切換；可在跑完後切換並重跑"
          >
            {PROVIDER_OPTIONS_DETAIL.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {changingProvider && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* 左：Skill 時間軸 */}
        <div className="col-span-12 lg:col-span-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ListVideo className="h-4 w-4 text-violet-500" /> 執行時間軸
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SkillTimeline
                currentSkill={currentSkill}
                skillStates={skillStates}
                onSelectSkill={(s) => setSelectedSkill(s)}
                selectedSkill={selectedSkill}
              />
            </CardContent>
          </Card>
        </div>

        {/* 中：Skill 詳情（含重跑；form / aux / versions 已搬到 /draft） */}
        <div className={`col-span-12 ${showRightCol ? "lg:col-span-6" : "lg:col-span-9"} space-y-4`}>
          <SkillDetail run={selectedRun} onRerun={handleRerun} rerunningSkill={rerunningSkill} />
        </div>

        {/* 右：既有班沿用判斷（只在跑過 existing_lookup 後出現） */}
        {showRightCol && (
          <div className="col-span-12 lg:col-span-3 space-y-4">
            <ExistingClassPanel
              topScore={existingMatches!.topScore}
              reuseRecommended={existingMatches!.reuseRecommended}
              hasReferences={existingMatches!.hasReferences}
              matches={existingMatches!.matches}
              onReuse={handleReuseClass}
              onContinueAsNew={() => setReuseDecided(true)}
              decided={reuseDecided || request.reuseClassId != null}
            />
          </div>
        )}
      </div>
    </div>
  );
}
