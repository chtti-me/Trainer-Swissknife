"use client";

/**
 * 課程規劃幫手 — 入口頁
 *
 * 培訓師：
 *   1. 貼上需求文字 + 上傳檔案（會自動把檔案內容 append 到需求文字尾端）
 *   2. 可填工作標題（不是最終班名）、總時數偏好、天數偏好
 *   3. 按「開始規劃」→ 建 request、跳到 [requestId]/page.tsx 自動跑 pipeline
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wand2, Upload, FileText, Sparkles, Clock, History, Cpu } from "lucide-react";
import { readResponseJson } from "@/lib/read-response-json";
import { useToast } from "@/components/ui/toaster";

type AiProviderChoice = "" | "gemini" | "openai" | "groq";

const PROVIDER_OPTIONS: { value: AiProviderChoice; label: string; hint: string }[] = [
  { value: "", label: "預設（依 .env AI_PROVIDER）", hint: "由系統管理員設定" },
  { value: "gemini", label: "Gemini 2.5 Flash", hint: "免費 250 RPD / 中文佳" },
  { value: "groq", label: "Groq llama-3.3-70b-versatile", hint: "免費 1000 RPD / 速度極快" },
  { value: "openai", label: "OpenAI gpt-4o-mini", hint: "需付費；穩定品質" },
];

const SAMPLE_INPUT = `培訓主題：生成式 AI 應用於企業文書作業
需求說明：
1. 希望讓行政同仁了解如何利用 ChatGPT、Copilot 等工具提升工作效率
2. 包含實際演練，學員要能夠現場練習
3. 預計一天課程（6-7 小時）
4. 對象：無 AI 使用經驗的一般行政人員`;

interface UploadFileMeta {
  filename: string;
  ext: string;
  charCount: number;
  lineCount: number;
}

interface RecentRequest {
  id: string;
  title: string | null;
  status: string;
  currentSkill: string | null;
  rawInputText: string;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "尚未啟動",
  running: "規劃進行中",
  completed: "規劃完成",
  reuse_existing: "建議沿用既有班",
  failed: "失敗",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  running: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  reuse_existing: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  failed: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

export default function CoursePlannerEntryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [rawInputText, setRawInputText] = useState("");
  const [title, setTitle] = useState("");
  const [preferredTotalHours, setPreferredTotalHours] = useState<string>("");
  const [preferredDays, setPreferredDays] = useState<string>("");
  const [aiProvider, setAiProvider] = useState<AiProviderChoice>("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadFileMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recent, setRecent] = useState<RecentRequest[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  const refreshRecent = useCallback(async () => {
    setRecentLoading(true);
    try {
      const res = await fetch("/api/course-planner/requests");
      const data = await readResponseJson<{ requests?: RecentRequest[]; error?: string }>(res);
      if (res.ok) setRecent(data.requests ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshRecent();
  }, [refreshRecent]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/course-planner/upload-parse", { method: "POST", body: fd });
      const data = await readResponseJson<{
        filename: string;
        ext: string;
        text: string;
        stats: { charCount: number; lineCount: number };
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || "解析失敗");

      // 把檔案內容 append 到 rawInputText 尾端
      setRawInputText((prev) => {
        const sep = prev.trim() ? "\n\n" : "";
        return `${prev}${sep}===== 上傳檔案：${data.filename} =====\n${data.text}`;
      });
      setUploadedFiles((prev) => [
        ...prev,
        {
          filename: data.filename,
          ext: data.ext,
          charCount: data.stats.charCount,
          lineCount: data.stats.lineCount,
        },
      ]);
      toast(`${data.filename} 解析完成，已附加到需求文字`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "上傳失敗", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleStart = async () => {
    if (rawInputText.trim().length < 10) {
      toast("請輸入至少 10 個字的培訓需求", "error");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/course-planner/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawInputText,
          title: title || null,
          sourceFiles: uploadedFiles,
          aiProvider: aiProvider || undefined,
        }),
      });
      const data = await readResponseJson<{ request?: { id: string }; error?: string }>(res);
      if (!res.ok || !data.request) throw new Error(data.error || "建立規劃需求失敗");

      const params = new URLSearchParams();
      if (preferredTotalHours) params.set("hours", preferredTotalHours);
      if (preferredDays) params.set("days", preferredDays);
      params.set("autostart", "1");

      router.push(`/course-planner/${data.request.id}?${params.toString()}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "建立失敗", "error");
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeading
          title="課程規劃幫手"
          description="貼上培訓需求，由 11 個 AI 技能依序產出開班計畫表草案"
        />
        <Link
          href="/course-planner/skills"
          className="hidden sm:inline-flex items-center gap-1.5 text-sm rounded-md border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 px-3 py-1.5 hover:bg-violet-100 dark:hover:bg-violet-900/40"
        >
          <Wand2 className="h-3.5 w-3.5" /> 只跑某幾個 Skill？開 課程規劃工具箱
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" /> 開新規劃
          </CardTitle>
          <CardDescription>
            把單位寫信來的需求、會議筆記或既有資料貼進來；可上傳 txt / docx / pdf / xlsx / csv。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">工作標題（選填，不是最終班名）</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：行政同仁 AI 文書效率班 規劃"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="raw-input">培訓需求</Label>
              <button
                type="button"
                onClick={() => setRawInputText(SAMPLE_INPUT)}
                className="text-xs text-violet-600 hover:underline"
              >
                帶入範例
              </button>
            </div>
            <Textarea
              id="raw-input"
              value={rawInputText}
              onChange={(e) => setRawInputText(e.target.value)}
              rows={12}
              placeholder="把單位寫來的需求、學員想學什麼、目前痛點、想達成什麼結果都貼進來。寫越多，AI 規劃越準。"
            />
            <div className="text-xs text-slate-500 dark:text-slate-400">{rawInputText.length} 字</div>
          </div>

          <div className="space-y-2">
            <Label>上傳補充檔案（選填）</Label>
            <div className="flex flex-wrap items-center gap-2">
              <label
                className={`inline-flex items-center gap-2 rounded-md border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2 text-sm hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : ""}`}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "解析中…" : "選擇檔案"}
                <input
                  type="file"
                  accept=".txt,.docx,.pdf,.xlsx,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUpload(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <span className="text-xs text-slate-500 dark:text-slate-400">支援 txt / docx / pdf / xlsx / csv，每檔 ≤ 10MB</span>
            </div>
            {uploadedFiles.length > 0 && (
              <ul className="mt-2 space-y-1">
                {uploadedFiles.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <FileText className="h-3.5 w-3.5" />
                    <span className="font-medium">{f.filename}</span>
                    <Badge variant="secondary" className="text-[10px]">{f.ext}</Badge>
                    <span className="text-slate-400 dark:text-slate-500">{f.charCount} 字 / {f.lineCount} 行</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="hours">總時數偏好（選填，小時）</Label>
              <Input
                id="hours"
                type="number"
                min={1}
                max={80}
                value={preferredTotalHours}
                onChange={(e) => setPreferredTotalHours(e.target.value)}
                placeholder="例：8"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="days">天數偏好（選填）</Label>
              <Input
                id="days"
                type="number"
                min={1}
                max={20}
                value={preferredDays}
                onChange={(e) => setPreferredDays(e.target.value)}
                placeholder="例：1"
              />
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 p-3">
            <Label htmlFor="ai-provider" className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
              <Cpu className="h-4 w-4 text-violet-500" /> AI 執行引擎（選填）
            </Label>
            <select
              id="ai-provider"
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value as AiProviderChoice)}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            >
              {PROVIDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}（{o.hint}）
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              一個 request 內 11 個 Skill 都會用同一家，避免風格不一致。Gemini 額度用完時可改 Groq；不選則走系統預設。
            </p>
          </div>

          <div className="flex justify-end">
            <Button size="lg" onClick={handleStart} disabled={submitting || rawInputText.trim().length < 10}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              開始規劃
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-slate-500 dark:text-slate-400" /> 最近的規劃
          </CardTitle>
          <CardDescription>顯示最近 50 筆，可繼續編輯或重看草案。</CardDescription>
        </CardHeader>
        <CardContent>
          {recentLoading ? (
            <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> 載入中…
            </div>
          ) : recent.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">尚未建立任何規劃需求。</div>
          ) : (
            <ul className="divide-y dark:divide-slate-800">
              {recent.map((r) => (
                <li key={r.id} className="py-3">
                  <Link href={`/course-planner/${r.id}`} className="flex items-start justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded p-2 -m-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-slate-800 dark:text-slate-100">{r.title || "（未命名）"}</span>
                        <Badge className={STATUS_COLOR[r.status] ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                        {r.currentSkill && r.status === "running" && (
                          <Badge variant="outline" className="text-xs">執行中：{r.currentSkill}</Badge>
                        )}
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2">{r.rawInputText.slice(0, 160)}</div>
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {new Date(r.createdAt).toLocaleString()}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
