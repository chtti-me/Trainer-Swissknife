/**
 * 課程規劃工具箱頁面（/course-planner/skills）
 *
 * 「我只想跑某幾個 Skill」的快速入口，與完整 11-Skill pipeline 平行。
 *
 * 流程：
 *  1. 勾選想跑的 Skill（卡片）
 *  2. 選起點：模式 A（貼一段 raw text）或模式 B（接續既有規劃單）
 *  3. 系統自動算傳遞依賴閉包並提示要補跑哪些上游
 *  4. SSE 串流進度
 *  5. 跑完每個 Skill 都可即時複製/匯出結果
 *
 * 不寫入主規劃單列表（kind=toolbox），跑完後資料保留在 DB 但首頁看不到。
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Cpu,
  Download,
  FileCode2,
  FileText,
  ImageIcon,
  Layers,
  Loader2,
  Wand2,
  XCircle,
  Network,
  Sparkles,
  Target,
} from "lucide-react";

import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import { readResponseJson } from "@/lib/read-response-json";

import {
  LLM_SKILL_NAMES,
  SKILL_DISPLAY_NAMES,
  SKILL_UPSTREAM,
  type LlmSkillName,
} from "@/lib/course-planner/schemas/common";
import {
  buildPartialMarkdown,
  buildPartialHtml,
  type PartialSkillResult,
} from "@/lib/course-planner/partial-exporters";

import { SkillResultCard } from "./components/skill-result-card";

// ----- Skill UI metadata -----
const SKILL_BLURB: Record<LlmSkillName, string> = {
  needs: "把模糊需求拆成「能力差距 × 受眾 × 證據」",
  audience: "鎖定主要對象、規模、不適合對象",
  objectives: "「學員完成課程後能做到 X」式的具體學習目標",
  outline: "拆 N 堂課，每堂時數、性質、重點、活動",
  format: "純直播／實體／混成、教學方法、平台／工具",
  instructor: "從 4 來源（個人人脈／培訓師名冊／歷史授課／網路）配對主推 + 備選",
  schedule: "「幾天 × 每天幾小時」與避開時段",
  promo: "對外招生文案（標題、亮點、利益點）",
  notification: "課前 7 / 3 / 1 天的提醒訊息",
  materials: "投影片／講義／範例／練習配置",
  assessment: "課中任務 × 學會證據 × 期末驗收",
};

const RECOMMENDED_PRESETS: { name: string; skills: LlmSkillName[] }[] = [
  { name: "課程設計四件組", skills: ["outline", "schedule", "instructor", "promo"] },
  { name: "需求 → 大綱", skills: ["outline"] },
  { name: "排課時程 + 通知", skills: ["schedule", "notification"] },
  { name: "教材 + 評量", skills: ["materials", "assessment"] },
];

// ----- 依賴解析（與後端 skill-toolbox.ts 一致；前端拷一份不打 API） -----
const SKILL_PIPELINE_ORDER_FE: LlmSkillName[] = [
  "needs",
  "audience",
  "objectives",
  "outline",
  "format",
  "instructor",
  "schedule",
  "materials",
  "assessment",
  "notification",
  "promo",
];

function resolveRequiredFE(selected: LlmSkillName[]): LlmSkillName[] {
  const required = new Set<LlmSkillName>(selected);
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of [...required]) {
      for (const dep of SKILL_UPSTREAM[s]) {
        if (!required.has(dep)) {
          required.add(dep);
          changed = true;
        }
      }
    }
  }
  return SKILL_PIPELINE_ORDER_FE.filter((n) => required.has(n));
}

// ----- 起點選擇 -----
type StartMode = "raw" | "reference";

interface ReferenceCandidate {
  id: string;
  title: string | null;
  rawInputText: string;
  status: string;
  createdAt: string;
  /** 該規劃單在 DB 已有 success run 的 Skill 名單；用於判斷上游能不能直接接 */
  successSkills?: LlmSkillName[];
}

// ----- SSE event types（對齊 partial-pipeline.ts） -----
type ToolboxEvent =
  | {
      type: "request_started";
      requestId: string;
      required: LlmSkillName[];
      displayed: LlmSkillName[];
      auxiliary: LlmSkillName[];
    }
  | { type: "skill_start"; skill: LlmSkillName; displayName: string; isAuxiliary: boolean }
  | {
      type: "skill_complete";
      skill: LlmSkillName;
      displayName: string;
      isAuxiliary: boolean;
      output: unknown;
      reasoning: string;
      durationMs: number;
      cached?: boolean;
      hit429?: boolean;
    }
  | { type: "skill_failed"; skill: LlmSkillName; displayName: string; error: string }
  | { type: "complete"; durationMs: number }
  | { type: "error"; message: string };

interface SkillResult {
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
}

export default function SkillToolboxPage() {
  const { toast } = useToast();

  const [selected, setSelected] = useState<Set<LlmSkillName>>(new Set(["outline"]));
  const [startMode, setStartMode] = useState<StartMode>("raw");
  const [rawText, setRawText] = useState("");
  const [referenceId, setReferenceId] = useState<string>("");
  const [aiProvider, setAiProvider] = useState<"" | "gemini" | "openai" | "groq">("");

  const [referenceCandidates, setReferenceCandidates] = useState<ReferenceCandidate[]>([]);
  const [refLoading, setRefLoading] = useState(false);

  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Map<LlmSkillName, SkillResult>>(new Map());
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);

  const required = useMemo(() => resolveRequiredFE([...selected]), [selected]);
  const auxiliary = useMemo(() => required.filter((s) => !selected.has(s)), [required, selected]);

  // ---------- 載入「可接續」的既有規劃單 ----------
  const loadReferenceCandidates = useCallback(async () => {
    setRefLoading(true);
    try {
      const res = await fetch("/api/course-planner/requests?kind=full");
      const data = await readResponseJson<{ requests?: ReferenceCandidate[]; error?: string }>(res);
      if (res.ok) setReferenceCandidates(data.requests ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setRefLoading(false);
    }
  }, []);

  useEffect(() => {
    if (startMode === "reference" && referenceCandidates.length === 0) {
      void loadReferenceCandidates();
    }
  }, [startMode, referenceCandidates.length, loadReferenceCandidates]);

  // ---------- 勾選操作 ----------
  const toggleSkill = (skill: LlmSkillName) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(skill)) next.delete(skill);
      else next.add(skill);
      if (next.size === 0) next.add(skill); // 至少留一個
      return next;
    });
  };

  const applyPreset = (preset: LlmSkillName[]) => {
    setSelected(new Set(preset));
  };

  // ---------- 啟動 partial pipeline（SSE） ----------
  const handleRun = async () => {
    if (selected.size === 0) {
      toast("請至少勾選 1 個 Skill", "error");
      return;
    }
    if (startMode === "raw" && rawText.trim().length < 10) {
      toast("請輸入至少 10 字的需求文字（或改用「接續既有」起點）", "error");
      return;
    }
    if (startMode === "reference" && !referenceId) {
      toast("請選擇一筆既有規劃單", "error");
      return;
    }

    // 初始化 results：把所有 required 設為 pending（auxiliary=true 的標好）
    const initial = new Map<LlmSkillName, SkillResult>();
    for (const s of required) {
      initial.set(s, {
        skill: s,
        displayName: SKILL_DISPLAY_NAMES[s],
        isAuxiliary: !selected.has(s),
        status: "pending",
      });
    }
    setResults(initial);
    setActiveRequestId(null);
    setRunning(true);

    try {
      const body: Record<string, unknown> = {
        selected: [...selected],
        aiProvider: aiProvider || undefined,
      };
      if (startMode === "raw") body.rawText = rawText.trim();
      else body.referenceRequestId = referenceId;

      const res = await fetch("/api/course-planner/skills/run-partial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        const err = await res.text();
        throw new Error(`啟動失敗：${err.slice(0, 200)}`);
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
            const event = JSON.parse(data) as ToolboxEvent;
            handleEvent(event);
          } catch (e) {
            console.warn("SSE parse failed", e, data);
          }
        }
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "執行失敗", "error");
    } finally {
      setRunning(false);
    }
  };

  function handleEvent(event: ToolboxEvent) {
    switch (event.type) {
      case "request_started":
        setActiveRequestId(event.requestId);
        toast(
          `已建立 toolbox 規劃單；${event.displayed.length} 個 Skill 將執行${
            event.auxiliary.length > 0 ? `、自動補上游 ${event.auxiliary.length} 個` : ""
          }`,
          "info",
        );
        break;
      case "skill_start":
        setResults((prev) => {
          const next = new Map(prev);
          const existing = next.get(event.skill);
          next.set(event.skill, {
            skill: event.skill,
            displayName: event.displayName,
            isAuxiliary: existing?.isAuxiliary ?? event.isAuxiliary,
            status: "running",
          });
          return next;
        });
        break;
      case "skill_complete":
        setResults((prev) => {
          const next = new Map(prev);
          next.set(event.skill, {
            skill: event.skill,
            displayName: event.displayName,
            isAuxiliary: event.isAuxiliary,
            status: "success",
            output: event.output,
            reasoning: event.reasoning,
            durationMs: event.durationMs,
            cached: event.cached,
            hit429: event.hit429,
          });
          return next;
        });
        break;
      case "skill_failed":
        setResults((prev) => {
          const next = new Map(prev);
          next.set(event.skill, {
            skill: event.skill,
            displayName: event.displayName,
            isAuxiliary: prev.get(event.skill)?.isAuxiliary ?? false,
            status: "failed",
            error: event.error,
          });
          return next;
        });
        toast(`${event.displayName} 失敗：${event.error.slice(0, 100)}`, "error");
        break;
      case "complete":
        toast(`所有 Skill 執行完成（${(event.durationMs / 1000).toFixed(1)}s）`, "success");
        break;
      case "error":
        toast(event.message, "error");
        break;
    }
  }

  // ---------- 頁面 ----------
  const orderedResults = useMemo(() => {
    const arr: SkillResult[] = [];
    for (const s of required) {
      const r = results.get(s);
      if (r) arr.push(r);
    }
    return arr;
  }, [required, results]);

  const finishedCount = orderedResults.filter((r) => r.status === "success").length;
  const totalCount = orderedResults.length;
  const allDone =
    !running &&
    totalCount > 0 &&
    orderedResults.every((r) => r.status === "success" || r.status === "failed") &&
    finishedCount > 0;

  // ---------- 全部跑完後的下載 ----------
  const buildExportSource = useCallback(() => {
    const successResults: PartialSkillResult[] = orderedResults
      .filter((r) => r.status === "success" && r.output !== undefined)
      .map((r) => ({
        skill: r.skill,
        displayName: r.displayName,
        isAuxiliary: r.isAuxiliary,
        output: r.output,
        reasoning: r.reasoning,
        durationMs: r.durationMs,
        cached: r.cached,
      }));
    return {
      requestId: activeRequestId,
      rawInputText: startMode === "raw" ? rawText.trim() : null,
      results: successResults,
      generatedAt: new Date(),
    };
  }, [orderedResults, activeRequestId, startMode, rawText]);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stamp = () =>
    new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .slice(0, 15);

  const handleDownloadMarkdown = () => {
    const md = buildPartialMarkdown(buildExportSource());
    downloadBlob(new Blob([md], { type: "text/markdown;charset=utf-8" }), `course-planner-toolbox-${stamp()}.md`);
    toast("Markdown 下載完成", "success");
  };

  const handleDownloadHtml = () => {
    const html = buildPartialHtml(buildExportSource());
    downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `course-planner-toolbox-${stamp()}.html`);
    toast("HTML 下載完成", "success");
  };

  const [exportingPng, setExportingPng] = useState(false);

  const handleDownloadPng = async () => {
    setExportingPng(true);
    try {
      const html = buildPartialHtml(buildExportSource());

      // 建一個離畫面但 layout 計算正確的容器
      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-99999px";
      container.style.top = "0";
      container.style.width = "880px";
      container.style.background = "#ffffff";
      container.innerHTML = html;
      document.body.appendChild(container);

      // 抓 body 子節點作為截圖目標，避免 html / head 帶進去
      const body = container.querySelector("body");
      const target = (body as HTMLElement | null) ?? container;

      // 動態 import 避免 SSR/build 期間 evaluate
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(target, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });

      document.body.removeChild(container);

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `course-planner-toolbox-${stamp()}.png`;
      a.click();
      toast("PNG 下載完成", "success");
    } catch (e) {
      console.error(e);
      toast(
        e instanceof Error
          ? `PNG 匯出失敗：${e.message.slice(0, 120)}（建議改用 HTML 或 Markdown）`
          : "PNG 匯出失敗",
        "error",
      );
    } finally {
      setExportingPng(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <Link
          href="/course-planner"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> 返回課程規劃幫手
        </Link>
        <PageHeading
          title="課程規劃工具箱"
          description="只跑你勾選的 Skill；系統會自動補上必要的上游依賴。執行結果只能複製／匯出，不會建立完整的開班計畫表草案。"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-5 w-5 text-violet-500" /> ① 勾選想跑的 Skill
          </CardTitle>
          <CardDescription>
            點卡片切換勾選；上游依賴會自動補上並以淡色標示「自動補跑」。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 推薦組合 */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">快速套用：</span>
            {RECOMMENDED_PRESETS.map((p) => (
              <Button
                key={p.name}
                size="sm"
                variant="outline"
                onClick={() => applyPreset(p.skills)}
                className="text-xs"
              >
                {p.name}
                <span className="ml-1 text-muted-foreground">（{p.skills.length}）</span>
              </Button>
            ))}
          </div>

          {/* Skill 卡片網格 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {LLM_SKILL_NAMES.map((skill) => {
              const isSelected = selected.has(skill);
              const isAux = required.includes(skill) && !isSelected;
              return (
                <button
                  key={skill}
                  type="button"
                  onClick={() => toggleSkill(skill)}
                  className={`text-left rounded-lg border p-3 transition ${
                    isSelected
                      ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20 ring-1 ring-violet-500/30"
                      : isAux
                        ? "border-amber-300 bg-amber-50/50 dark:border-amber-700/50 dark:bg-amber-900/10"
                        : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium">{SKILL_DISPLAY_NAMES[skill]}</span>
                    {isSelected ? (
                      <CheckCircle2 className="h-4 w-4 text-violet-600 dark:text-violet-300 shrink-0" />
                    ) : isAux ? (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-400 text-amber-700 dark:text-amber-300">
                        自動補跑
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                    {SKILL_BLURB[skill]}
                  </p>
                </button>
              );
            })}
          </div>

          {/* 依賴摘要 */}
          <div className="rounded-md border bg-muted/30 dark:bg-muted/20 p-3 text-xs space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Network className="h-3.5 w-3.5" /> 執行順序（共 {required.length} 步）：
            </div>
            <div className="flex flex-wrap gap-1.5">
              {required.map((s, idx) => (
                <span
                  key={s}
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 ${
                    selected.has(s)
                      ? "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200"
                      : "bg-amber-100/70 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                  }`}
                >
                  <span className="text-[10px] opacity-60">{idx + 1}.</span>
                  {SKILL_DISPLAY_NAMES[s]}
                </span>
              ))}
            </div>
            {auxiliary.length > 0 && (
              <p className="text-[11px] text-muted-foreground pt-1">
                * 琥珀色為「自動補上的上游」，是執行你勾選的 Skill 必要前置；如果起點選「接續既有」，這些上游會直接沿用既有結果不重跑。
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-5 w-5 text-violet-500" /> ② 選擇起點
          </CardTitle>
          <CardDescription>新需求文字（從零跑起）／接續某個既有規劃單（沿用上游不重跑）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={startMode === "raw" ? "default" : "outline"}
              onClick={() => setStartMode("raw")}
            >
              貼新需求
            </Button>
            <Button
              size="sm"
              variant={startMode === "reference" ? "default" : "outline"}
              onClick={() => setStartMode("reference")}
            >
              接續既有規劃單
            </Button>
          </div>

          {startMode === "raw" ? (
            <Textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={6}
              placeholder="貼上你的培訓需求草稿，至少 10 字。建議涵蓋：訓練主題、訓練對象、痛點、預期時數、形式偏好、特殊要求等。"
              className="font-mono text-xs"
            />
          ) : (
            <div className="space-y-2">
              {refLoading ? (
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> 載入規劃單中…
                </div>
              ) : referenceCandidates.length === 0 ? (
                <div className="text-xs text-muted-foreground">
                  尚無既有規劃單。請先到{" "}
                  <Link href="/course-planner" className="underline">
                    課程規劃幫手
                  </Link>{" "}
                  跑一次完整 pipeline，再回來這裡接續。
                </div>
              ) : (
                <select
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="">— 請選擇既有規劃單 —</option>
                  {referenceCandidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title || "（未命名）"} ｜{c.status}｜
                      {new Date(c.createdAt).toLocaleDateString("zh-TW")}
                    </option>
                  ))}
                </select>
              )}
              {referenceId && (
                <p className="text-[11px] text-muted-foreground">
                  系統會自動把該規劃單的「上游 Skill 結果」直接帶入；你勾選的 Skill 會以這些上游為基礎重跑。
                </p>
              )}
            </div>
          )}

          {/* AI 供應商 */}
          <div className="flex items-center gap-2 pt-1">
            <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">執行引擎：</span>
            <select
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value as typeof aiProvider)}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              <option value="">預設（依 .env）</option>
              <option value="gemini">Gemini</option>
              <option value="groq">Groq</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {orderedResults.length > 0 && (
            <span>
              進度：{finishedCount} / {orderedResults.length} 完成
              {activeRequestId && <span className="ml-2 opacity-60">（toolbox 規劃單 id={activeRequestId.slice(0, 8)}…）</span>}
            </span>
          )}
        </div>
        <Button onClick={handleRun} disabled={running} size="lg">
          {running ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> 執行中…
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4 mr-2" /> 開始執行（{required.length} 步）
            </>
          )}
        </Button>
      </div>

      {/* 結果 */}
      {orderedResults.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-500" />
              <h3 className="text-base font-semibold">執行結果</h3>
              <Badge variant="outline" className="text-xs">
                {allDone
                  ? `全部完成（${finishedCount} / ${totalCount}）`
                  : `${finishedCount} / ${totalCount} 完成`}
              </Badge>
            </div>

            {allDone && (
              <details className="relative">
                <summary className="list-none cursor-pointer">
                  <Button variant="default" size="sm" asChild className="bg-violet-600 hover:bg-violet-700">
                    <span>
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      下載全部結果
                    </span>
                  </Button>
                </summary>
                <div className="absolute right-0 mt-1 z-20 rounded-md border bg-popover dark:bg-slate-900 dark:border-slate-700 shadow-lg min-w-[220px] py-1">
                  <div className="px-3 py-2 text-[11px] text-muted-foreground border-b dark:border-slate-700">
                    給人閱讀的格式
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadMarkdown}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/60 dark:hover:bg-slate-800"
                  >
                    <FileText className="h-4 w-4 text-emerald-600" />
                    <div className="flex flex-col">
                      <span>下載 Markdown (.md)</span>
                      <span className="text-[10px] text-muted-foreground">最常用；可貼進 Notion / Obsidian</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadHtml}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/60 dark:hover:bg-slate-800"
                  >
                    <FileCode2 className="h-4 w-4 text-sky-600" />
                    <div className="flex flex-col">
                      <span>下載 HTML (.html)</span>
                      <span className="text-[10px] text-muted-foreground">瀏覽器直接打開閱讀</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadPng}
                    disabled={exportingPng}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/60 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    {exportingPng ? (
                      <Loader2 className="h-4 w-4 text-rose-600 animate-spin" />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-rose-600" />
                    )}
                    <div className="flex flex-col">
                      <span>{exportingPng ? "PNG 製作中…" : "下載 PNG 圖片 (.png)"}</span>
                      <span className="text-[10px] text-muted-foreground">截圖貼進簡報／Email 用</span>
                    </div>
                  </button>
                </div>
              </details>
            )}
          </div>

          {orderedResults.map((r) => (
            <SkillResultCard key={r.skill} result={r} />
          ))}
        </div>
      )}

      {/* 空狀態 */}
      {orderedResults.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-muted-foreground/20 p-8 text-center text-sm text-muted-foreground">
          <XCircle className="h-8 w-8 mx-auto opacity-30 mb-2" />
          尚未執行；勾選 Skill、選好起點後按「開始執行」
        </div>
      )}
    </div>
  );
}
