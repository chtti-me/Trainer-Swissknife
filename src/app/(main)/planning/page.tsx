"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Wand2, Download, Save, Upload, FileText, Users, Target, BookOpen, Clock } from "lucide-react";
import { readResponseJson } from "@/lib/read-response-json";
import { useToast } from "@/components/ui/toaster";
import type { CoursePlanInput, CoursePlanResult, CoursePlanState } from "@/lib/planning/types";
import { createCoursePlanState } from "@/lib/planning/types";

const SAMPLE_INPUT = `培訓主題：生成式 AI 應用於企業文書作業
需求說明：
1. 希望讓行政同仁了解如何利用 ChatGPT、Copilot 等工具提升工作效率
2. 包含實際演練，學員要能夠現場練習
3. 預計一天課程（6-7 小時）
4. 對象：無 AI 使用經驗的一般行政人員`;

interface PlanningDraftRow {
  id: string;
  versionNo: number;
  createdAt: string;
  editedOutputJson?: string;
  aiOutputJson?: string;
}

export default function PlanningPage() {
  const { toast } = useToast();
  const [state, setState] = useState<CoursePlanState>(createCoursePlanState);
  const [planningDrafts, setPlanningDrafts] = useState<PlanningDraftRow[]>([]);
  const [activeVersionNo, setActiveVersionNo] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const refreshDrafts = useCallback(async () => {
    if (!state.requestId) return;
    try {
      const res = await fetch(`/api/planning/${state.requestId}/drafts`);
      const data = await readResponseJson<{ error?: string; drafts?: PlanningDraftRow[] }>(res);
      if (!res.ok) throw new Error(data.error || "載入版本失敗");
      setPlanningDrafts(data.drafts ?? []);
      if (data.drafts?.length && activeVersionNo == null) {
        setActiveVersionNo(data.drafts[0].versionNo);
      }
    } catch (e) {
      console.error(e);
    }
  }, [state.requestId, activeVersionNo]);

  useEffect(() => {
    void refreshDrafts();
  }, [refreshDrafts]);

  const runGenerate = async () => {
    if (!state.input.requirementText.trim()) return;
    setState((p) => ({ ...p, loading: true }));
    try {
      const res = await fetch("/api/planning/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state.input),
      });
      const data = await readResponseJson<{ success: boolean; result?: CoursePlanResult; error?: string }>(res);
      if (!res.ok || !data.result) throw new Error(data.error || "產生規劃失敗");
      setState((p) => ({ ...p, result: data.result!, step: "result", loading: false }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "產生規劃失敗", "error");
      setState((p) => ({ ...p, loading: false }));
    }
  };

  const saveDraft = async () => {
    if (!state.result) return;
    setSaving(true);
    try {
      let requestId = state.requestId;
      if (!requestId) {
        const parseRes = await fetch("/api/planning/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: state.input.requirementText,
            title: state.result.suggestedTitle,
          }),
        });
        const parseData = await readResponseJson<{ error?: string; requestId?: string }>(parseRes);
        if (!parseRes.ok || !parseData.requestId) throw new Error(parseData.error || "建立 request 失敗");
        requestId = parseData.requestId;
      }

      const res = await fetch(`/api/planning/${requestId}/save-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editedContent: { input: state.input, result: state.result },
          aiOutputJson: JSON.stringify(state.result),
        }),
      });
      const data = await readResponseJson<{ error?: string; draft?: { versionNo?: number } }>(res);
      if (!res.ok) throw new Error(data.error || "儲存失敗");

      setState((p) => ({ ...p, requestId: requestId! }));
      toast(`已儲存草案 v${data.draft?.versionNo ?? "?"}`, "success");
      await refreshDrafts();
    } catch (e) {
      toast(e instanceof Error ? e.message : "儲存失敗", "error");
    } finally {
      setSaving(false);
    }
  };

  const exportDraft = async (format: "markdown" | "html" | "json") => {
    if (!state.result) return;
    try {
      const res = await fetch("/api/planning/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, data: { result: state.result, input: state.input } }),
      });
      if (!res.ok) {
        const err = await readResponseJson<{ error?: string }>(res);
        throw new Error(err.error || "匯出失敗");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = format === "json" ? "json" : format === "html" ? "html" : "md";
      a.download = `課程規劃_${state.result.suggestedTitle.slice(0, 20)}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast(e instanceof Error ? e.message : "匯出失敗", "error");
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/planning/upload-parse", { method: "POST", body: form });
      const data = await readResponseJson<{ error?: string; text?: string }>(res);
      if (!res.ok || !data.text) throw new Error(data.error || "上傳解析失敗");
      setState((p) => ({
        ...p,
        input: { ...p.input, requirementText: data.text! },
      }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "上傳失敗", "error");
    } finally {
      setUploading(false);
    }
  };

  const applyDraftVersion = (versionNo: number) => {
    const row = planningDrafts.find((x) => x.versionNo === versionNo);
    if (!row) return;
    try {
      const raw = row.editedOutputJson || row.aiOutputJson || "{}";
      const parsed = JSON.parse(raw) as { input?: CoursePlanInput; result?: CoursePlanResult };
      if (parsed.result) {
        setState((p) => ({
          ...p,
          input: parsed.input || p.input,
          result: parsed.result || null,
          step: parsed.result ? "result" : "input",
        }));
        setActiveVersionNo(versionNo);
      }
    } catch {
      toast("讀取版本失敗", "error");
    }
  };

  const updateInput = <K extends keyof CoursePlanInput>(key: K, value: CoursePlanInput[K]) => {
    setState((p) => ({ ...p, input: { ...p.input, [key]: value } }));
  };

  const canGenerate = state.input.requirementText.trim().length >= 10 && !state.loading;

  return (
    <div className="space-y-6">
      <PageHeading
        title="課程規劃幫手"
        description="貼上培訓需求，AI 一次產出開班計劃表所需的核心欄位"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 左側：輸入區 */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                培訓需求
              </CardTitle>
              <CardDescription>
                貼上培訓需求文字，或上傳檔案（.txt / .pdf / .docx）
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Textarea
                  placeholder="請輸入培訓需求說明..."
                  value={state.input.requirementText}
                  onChange={(e) => updateInput("requirementText", e.target.value)}
                  rows={10}
                  className="resize-none"
                />
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs text-muted-foreground">
                    {state.input.requirementText.length} 字
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateInput("requirementText", SAMPLE_INPUT)}
                    >
                      載入範例
                    </Button>
                    <label>
                      <input
                        type="file"
                        accept=".txt,.pdf,.docx"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleUpload(file);
                        }}
                      />
                      <Button variant="outline" size="sm" asChild disabled={uploading}>
                        <span>
                          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                          <span className="ml-1">上傳檔案</span>
                        </span>
                      </Button>
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="preferredTitle">偏好班名（選填）</Label>
                  <Input
                    id="preferredTitle"
                    placeholder="例如：AI 文書效率班"
                    value={state.input.preferredTitle || ""}
                    onChange={(e) => updateInput("preferredTitle", e.target.value || undefined)}
                  />
                </div>
                <div>
                  <Label htmlFor="preferredHours">偏好時數（選填）</Label>
                  <Input
                    id="preferredHours"
                    type="number"
                    min={1}
                    placeholder="例如：12"
                    value={state.input.preferredHours || ""}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      updateInput("preferredHours", isNaN(v) || v <= 0 ? undefined : v);
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 動作按鈕 */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => void runGenerate()} disabled={!canGenerate} className="min-w-[140px]">
                  {state.loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="mr-2 h-4 w-4" />
                  )}
                  產生規劃
                </Button>
                {state.result && (
                  <>
                    <Button variant="outline" onClick={() => void saveDraft()} disabled={saving}>
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      儲存草案
                    </Button>
                    <Button variant="outline" onClick={() => void exportDraft("markdown")}>
                      <Download className="mr-2 h-4 w-4" />
                      匯出 Markdown
                    </Button>
                    <Button variant="outline" onClick={() => void exportDraft("html")}>
                      <Download className="mr-2 h-4 w-4" />
                      匯出 HTML
                    </Button>
                    <Button variant="outline" onClick={() => void exportDraft("json")}>
                      <Download className="mr-2 h-4 w-4" />
                      匯出 JSON
                    </Button>
                  </>
                )}
              </div>

              {planningDrafts.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <Label className="text-sm">歷史版本</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {planningDrafts.map((d) => (
                      <Button
                        key={d.id}
                        variant={d.versionNo === activeVersionNo ? "default" : "outline"}
                        size="sm"
                        onClick={() => applyDraftVersion(d.versionNo)}
                      >
                        v{d.versionNo}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 右側：結果區 */}
        <div className="space-y-4">
          {state.result ? (
            <>
              {/* 建議班名 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <BookOpen className="h-5 w-5 text-primary" />
                    建議班名
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-semibold">{state.result.suggestedTitle}</p>
                </CardContent>
              </Card>

              {/* 目標、對象、預備知識 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Target className="h-5 w-5 text-primary" />
                    課程基本資訊
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-muted-foreground text-xs">目標</Label>
                    <p>{state.result.objective}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">對象</Label>
                    <p>{state.result.targetAudience}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">預備知識</Label>
                    <p>{state.result.prerequisites}</p>
                  </div>
                </CardContent>
              </Card>

              {/* 課程模組 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Clock className="h-5 w-5 text-primary" />
                    課程模組（總計 {state.result.totalHours} 小時）
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2 font-medium">課程名稱</th>
                          <th className="text-right py-2 px-2 font-medium w-20">時數</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.result.modules.map((m, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-2 px-2">{m.name}</td>
                            <td className="py-2 px-2 text-right">{m.hours} hr</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* 建議講師 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="h-5 w-5 text-primary" />
                    建議講師人選
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2 font-medium">講師姓名</th>
                          <th className="text-left py-2 px-2 font-medium">教學領域</th>
                          <th className="text-left py-2 px-2 font-medium w-24">來源</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.result.instructors.map((inst, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-2 px-2 font-medium">{inst.name}</td>
                            <td className="py-2 px-2">{inst.expertise}</td>
                            <td className="py-2 px-2">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                  inst.source === "web_search"
                                    ? "bg-green-100 text-green-800"
                                    : "bg-blue-100 text-blue-800"
                                }`}
                              >
                                {inst.source === "web_search" ? "網路搜尋" : "AI 推薦"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {state.result.instructors.some((i) => i.source === "ai_recommendation") && (
                    <p className="text-xs text-muted-foreground mt-3">
                      ※ AI 推薦的講師人選僅供參考，建議人工查證實際資歷
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="h-full min-h-[400px] flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Wand2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>輸入培訓需求後，點擊「產生規劃」</p>
                <p className="text-sm mt-2">AI 將一次產出開班計劃表所需的核心欄位</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
