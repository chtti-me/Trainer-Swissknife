"use client";

/**
 * 【AI 技能脈絡】全院共用（管理員）＋個人版本化內容；供全系統生成式 AI 注入 Prompt。
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { PageHeading } from "@/components/layout/page-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Brain, Loader2, Save, Shield } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { SkeletonCard } from "@/components/ui/skeleton";
import { MAX_AI_SKILL_CONTENT_LENGTH } from "@/lib/ai-skill-limits";
import { readResponseJson } from "@/lib/read-response-json";
import { useToast } from "@/components/ui/toaster";

type GlobalListItem = {
  slug: string;
  title: string;
  sortOrder: number;
  versionCount: number;
  latestVersionNo: number | null;
  latestCreatedAt: string | null;
  latestContentPreview: string;
};

type VersionRow = { versionNo: number; createdAt: string; content: string };

export default function AiSkillsSettingsPage() {
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  // —— 個人 ——
  const [pLoading, setPLoading] = useState(true);
  const [pVersions, setPVersions] = useState<VersionRow[]>([]);
  const [pSelectedNo, setPSelectedNo] = useState<number | "">("");
  const [pDraft, setPDraft] = useState("");
  const [pSaving, setPSaving] = useState(false);

  const loadPersonal = useCallback(async () => {
    setPLoading(true);
    try {
      const res = await fetch("/api/ai-skills/personal");
      const data = await readResponseJson<{ error?: string; versions?: VersionRow[] }>(res);
      if (!res.ok) throw new Error(data.error || "載入失敗");
      const vers = (data.versions || []) as VersionRow[];
      setPVersions(vers);
      const latest = vers[0];
      if (latest) {
        setPSelectedNo(latest.versionNo);
        setPDraft(latest.content);
      } else {
        setPSelectedNo("");
        setPDraft("");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") loadPersonal();
  }, [status, loadPersonal]);

  const onPersonalVersionChange = (val: string) => {
    const no = parseInt(val, 10);
    setPSelectedNo(no);
    const row = pVersions.find((v) => v.versionNo === no);
    if (row) setPDraft(row.content);
  };

  const savePersonalNewVersion = async () => {
    setPSaving(true);
    try {
      const res = await fetch("/api/ai-skills/personal/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: pDraft }),
      });
      const data = await readResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "儲存失敗");
      await loadPersonal();
    } catch (e) {
      console.error(e);
      toast(e instanceof Error ? e.message : "儲存失敗", "error");
    } finally {
      setPSaving(false);
    }
  };

  const restorePersonalAsNew = async () => {
    if (pSelectedNo === "" || typeof pSelectedNo !== "number") return;
    setPSaving(true);
    try {
      const res = await fetch("/api/ai-skills/personal/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restoreFromVersionNo: pSelectedNo }),
      });
      const data = await readResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "還原失敗");
      await loadPersonal();
    } catch (e) {
      console.error(e);
      toast(e instanceof Error ? e.message : "還原失敗", "error");
    } finally {
      setPSaving(false);
    }
  };

  // —— 全院（管理員）——
  const [gList, setGList] = useState<GlobalListItem[]>([]);
  const [gListLoading, setGListLoading] = useState(false);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [gDetailLoading, setGDetailLoading] = useState(false);
  const [gTitle, setGTitle] = useState("");
  const [gSort, setGSort] = useState(0);
  const [gToolBinding, setGToolBinding] = useState("");
  const [gTriggerCondition, setGTriggerCondition] = useState("");
  const [gVersions, setGVersions] = useState<VersionRow[]>([]);
  const [gSelectedNo, setGSelectedNo] = useState<number | "">("");
  const [gDraft, setGDraft] = useState("");
  const [gSaving, setGSaving] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newInitialContent, setNewInitialContent] = useState("");
  const [creating, setCreating] = useState(false);

  // —— 全院（唯讀，培訓師）——
  const [roList, setRoList] = useState<GlobalListItem[]>([]);
  const [roListLoading, setRoListLoading] = useState(false);
  const [roActiveSlug, setRoActiveSlug] = useState<string | null>(null);
  const [roDetailLoading, setRoDetailLoading] = useState(false);
  const [roTitle, setRoTitle] = useState("");
  const [roVersions, setRoVersions] = useState<VersionRow[]>([]);
  const [roSelectedNo, setRoSelectedNo] = useState<number | "">("");
  const [roDraft, setRoDraft] = useState("");

  const loadReadOnlyGlobalList = useCallback(async () => {
    if (isAdmin) return;
    setRoListLoading(true);
    try {
      const res = await fetch("/api/ai-skills/global");
      const data = await readResponseJson<GlobalListItem[] | { error?: string }>(res);
      if (!res.ok) throw new Error((data as { error?: string }).error || "載入失敗");
      if (!Array.isArray(data)) throw new Error("載入失敗：回應格式異常");
      setRoList(data);
    } catch (e) {
      console.error(e);
    } finally {
      setRoListLoading(false);
    }
  }, [isAdmin]);

  const openReadOnlyGlobal = async (slug: string) => {
    setRoActiveSlug(slug);
    setRoDetailLoading(true);
    try {
      const res = await fetch(`/api/ai-skills/global/${encodeURIComponent(slug)}`);
      const data = await readResponseJson<{
        error?: string;
        title?: string;
        versions?: VersionRow[];
      }>(res);
      if (!res.ok) throw new Error(data.error || "載入失敗");
      setRoTitle(data.title ?? "");
      const vers = (data.versions || []) as VersionRow[];
      setRoVersions(vers);
      const latest = vers[0];
      if (latest) {
        setRoSelectedNo(latest.versionNo);
        setRoDraft(latest.content);
      } else {
        setRoSelectedNo("");
        setRoDraft("");
      }
    } catch (e) {
      console.error(e);
      toast(e instanceof Error ? e.message : "載入失敗", "error");
    } finally {
      setRoDetailLoading(false);
    }
  };

  const onReadOnlyVersionChange = (val: string) => {
    const no = parseInt(val, 10);
    setRoSelectedNo(no);
    const row = roVersions.find((v) => v.versionNo === no);
    if (row) setRoDraft(row.content);
  };

  useEffect(() => {
    if (status === "authenticated" && !isAdmin) loadReadOnlyGlobalList();
  }, [status, isAdmin, loadReadOnlyGlobalList]);

  const loadGlobalList = useCallback(async () => {
    if (!isAdmin) return;
    setGListLoading(true);
    try {
      const res = await fetch("/api/admin/ai-skills/global");
      const data = await readResponseJson<GlobalListItem[] | { error?: string }>(res);
      if (!res.ok) throw new Error((data as { error?: string }).error || "載入失敗");
      if (!Array.isArray(data)) throw new Error("載入失敗：回應格式異常");
      setGList(data);
    } catch (e) {
      console.error(e);
    } finally {
      setGListLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) loadGlobalList();
  }, [isAdmin, loadGlobalList]);

  const openGlobal = async (slug: string) => {
    setActiveSlug(slug);
    setGDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/ai-skills/global/${encodeURIComponent(slug)}`);
      const data = await readResponseJson<{
        error?: string;
        title?: string;
        sortOrder?: number;
        toolBinding?: string | null;
        triggerCondition?: string | null;
        versions?: VersionRow[];
      }>(res);
      if (!res.ok) throw new Error(data.error || "載入失敗");
      setGTitle(data.title ?? "");
      setGSort(data.sortOrder ?? 0);
      setGToolBinding(data.toolBinding ?? "");
      setGTriggerCondition(data.triggerCondition ?? "");
      const vers = (data.versions || []) as VersionRow[];
      setGVersions(vers);
      const latest = vers[0];
      if (latest) {
        setGSelectedNo(latest.versionNo);
        setGDraft(latest.content);
      } else {
        setGSelectedNo("");
        setGDraft("");
      }
    } catch (e) {
      console.error(e);
      toast(e instanceof Error ? e.message : "載入失敗", "error");
    } finally {
      setGDetailLoading(false);
    }
  };

  const onGlobalVersionChange = (val: string) => {
    const no = parseInt(val, 10);
    setGSelectedNo(no);
    const row = gVersions.find((v) => v.versionNo === no);
    if (row) setGDraft(row.content);
  };

  const saveGlobalMeta = async () => {
    if (!activeSlug) return;
    setGSaving(true);
    try {
      const res = await fetch(`/api/admin/ai-skills/global/${encodeURIComponent(activeSlug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: gTitle,
          sortOrder: gSort,
          toolBinding: gToolBinding.trim() || null,
          triggerCondition: gTriggerCondition.trim() || null,
        }),
      });
      const data = await readResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "更新失敗");
      await loadGlobalList();
    } catch (e) {
      console.error(e);
      toast(e instanceof Error ? e.message : "更新失敗", "error");
    } finally {
      setGSaving(false);
    }
  };

  const saveGlobalNewVersion = async () => {
    if (!activeSlug) return;
    setGSaving(true);
    try {
      const res = await fetch(`/api/admin/ai-skills/global/${encodeURIComponent(activeSlug)}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: gDraft }),
      });
      const data = await readResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "儲存失敗");
      await openGlobal(activeSlug);
      await loadGlobalList();
    } catch (e) {
      console.error(e);
      toast(e instanceof Error ? e.message : "儲存失敗", "error");
    } finally {
      setGSaving(false);
    }
  };

  const restoreGlobalAsNew = async () => {
    if (!activeSlug || gSelectedNo === "" || typeof gSelectedNo !== "number") return;
    setGSaving(true);
    try {
      const res = await fetch(`/api/admin/ai-skills/global/${encodeURIComponent(activeSlug)}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restoreFromVersionNo: gSelectedNo }),
      });
      const data = await readResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "還原失敗");
      await openGlobal(activeSlug);
      await loadGlobalList();
    } catch (e) {
      console.error(e);
      toast(e instanceof Error ? e.message : "還原失敗", "error");
    } finally {
      setGSaving(false);
    }
  };

  const createGlobal = async () => {
    const slug = newSlug.trim().toLowerCase();
    const title = newTitle.trim();
    if (!slug || !title) {
      toast("請填寫「內部代號」與「顯示標題」", "error");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/ai-skills/global", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          title,
          initialContent: newInitialContent.trim() || undefined,
        }),
      });
      const data = await readResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "建立失敗");
      setNewSlug("");
      setNewTitle("");
      setNewInitialContent("");
      await loadGlobalList();
      await openGlobal(slug);
    } catch (e) {
      console.error(e);
      toast(e instanceof Error ? e.message : "建立失敗", "error");
    } finally {
      setCreating(false);
    }
  };

  if (status === "loading") {
    return <SkeletonCard lines={4} />;
  }

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="gap-1">
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" />
            返回系統設定
          </Link>
        </Button>
      </div>

      <PageHeading
        title="AI 技能脈絡"
        description="全院共用由管理員維護（培訓師可檢視）；個人版供 AI 理解您的偏好。內容會自動併入課程規劃、EDM 等功能的 Prompt（日後新增之 AI 功能亦同）。"
      />

      {!isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-muted-foreground" />
              全院共用技能（僅檢視）
            </CardTitle>
            <CardDescription>
              以下為系統管理員維護之全院 AI 技能面向與目前版本內容。您可切換版本閱讀歷史內容，但無法編輯；若需調整機構共通做法，請洽管理員。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {roListLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : roList.length === 0 ? (
              <p className="text-sm text-muted-foreground">尚無全院技能資料。</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {roList.map((row) => (
                  <Button
                    key={row.slug}
                    type="button"
                    variant={roActiveSlug === row.slug ? "default" : "outline"}
                    size="sm"
                    className="h-auto min-h-9 flex-col items-start gap-0.5 py-1.5"
                    onClick={() => openReadOnlyGlobal(row.slug)}
                  >
                    <span className="font-medium">{row.title}</span>
                    <span className="text-[10px] font-normal opacity-80">
                      代號 {row.slug} · {row.versionCount} 版
                    </span>
                  </Button>
                ))}
              </div>
            )}

            {roActiveSlug && (
              <>
                <Separator />
                {roDetailLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="font-normal">
                        {roTitle}
                      </Badge>
                      <span className="text-xs text-muted-foreground">內部代號 {roActiveSlug}</span>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="space-y-2 min-w-[14rem]">
                        <Label>版本（新→舊）</Label>
                        <Select
                          value={roSelectedNo === "" ? "" : String(roSelectedNo)}
                          onValueChange={onReadOnlyVersionChange}
                          disabled={roVersions.length === 0}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={roVersions.length ? "選擇版本" : "尚無版本"} />
                          </SelectTrigger>
                          <SelectContent>
                            {roVersions.map((v) => (
                              <SelectItem key={v.versionNo} value={String(v.versionNo)}>
                                第 {v.versionNo} 版 · {formatDateTime(v.createdAt)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Textarea
                      readOnly
                      rows={14}
                      value={roDraft}
                      className="font-mono text-sm bg-muted/40"
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-primary" />
            個人培訓師脈絡
          </CardTitle>
          <CardDescription>
            描述您慣用的規劃重點、語氣、禁忌或內部協作習慣（勿含個資）。每次儲存會新增一個版本；可自下拉選單載入舊版後再編輯存檔，或直接「將所選版本複製成新版本」。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-2 min-w-[14rem]">
                  <Label>版本（新→舊）</Label>
                  <Select
                    value={pSelectedNo === "" ? "" : String(pSelectedNo)}
                    onValueChange={onPersonalVersionChange}
                    disabled={pVersions.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={pVersions.length ? "選擇版本" : "尚無版本"} />
                    </SelectTrigger>
                    <SelectContent>
                      {pVersions.map((v) => (
                        <SelectItem key={v.versionNo} value={String(v.versionNo)}>
                          第 {v.versionNo} 版 · {formatDateTime(v.createdAt)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pSaving || pVersions.length === 0 || pSelectedNo === ""}
                  onClick={restorePersonalAsNew}
                >
                  將所選版本複製成新版本
                </Button>
              </div>
              <Textarea
                rows={12}
                maxLength={MAX_AI_SKILL_CONTENT_LENGTH}
                value={pDraft}
                onChange={(e) => setPDraft(e.target.value)}
                placeholder="例如：我習慣先確認需求單位 KPI、課程命名偏好帶入院所別、EDM 語氣偏穩健⋯"
                className="font-mono text-sm"
              />
              <p className="text-right text-xs text-muted-foreground tabular-nums">
                {pDraft.length.toLocaleString("zh-TW")} / {MAX_AI_SKILL_CONTENT_LENGTH.toLocaleString("zh-TW")}
              </p>
              <Button type="button" onClick={savePersonalNewVersion} disabled={pSaving}>
                {pSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span className="ml-2">儲存為新版本</span>
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card className="border-amber-200/80 bg-amber-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-amber-800" />
              全院共用技能（管理員）
            </CardTitle>
            <CardDescription className="space-y-2 text-pretty">
              <span>
                每一筆代表一種「技能面向」：畫面上會看到<strong>顯示標題</strong>（給人看的名稱），以及系統內部使用的<strong>內部代號</strong>（英文短名，技術上稱為
                slug（網址／程式識別鍵））。內部代號建立後請勿隨意更改，以免與紀錄或 API 路徑不一致。
              </span>
              <span className="block">
                真正餵給 AI 的長篇說明寫在<strong>技能內容</strong>（版本化儲存）；一般培訓師可在「AI 技能脈絡」頁面<strong>檢視</strong>全院版本，但僅管理員可編輯下列區塊。
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4 rounded-lg border bg-background/80 p-4 shadow-sm">
              <div className="space-y-2">
                <Label htmlFor="new-global-skill-code">內部代號（程式識別用，英文短名）</Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  僅供系統辨識，請用小寫英文、數字與底線，例如 <code className="rounded bg-muted px-1">course_planning</code>。這<strong>不是</strong>長篇技能內文；長文請填在下方「第一版技能內容」或建立後於編輯區撰寫。
                </p>
                <Input
                  id="new-global-skill-code"
                  className="max-w-xl font-mono text-sm"
                  placeholder="例如：report_writing"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-global-skill-title">顯示標題（給人看的名稱）</Label>
                <Input
                  id="new-global-skill-title"
                  className="max-w-xl"
                  placeholder="例如：課程規劃寫作風格"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-global-skill-body">第一版技能內容（選填）</Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  此段文字會成為第 1 版並注入各 AI 功能；可留空，之後再於下方編輯區補上。單版上限 {MAX_AI_SKILL_CONTENT_LENGTH.toLocaleString("zh-TW")} 字元。
                </p>
                <Textarea
                  id="new-global-skill-body"
                  rows={8}
                  maxLength={MAX_AI_SKILL_CONTENT_LENGTH}
                  value={newInitialContent}
                  onChange={(e) => setNewInitialContent(e.target.value)}
                  placeholder="在此撰寫要告訴 AI 的機構共通做法、語氣、禁忌、範例方向⋯⋯"
                  className="min-h-[8rem] font-mono text-sm"
                />
                <p className="text-right text-xs text-muted-foreground tabular-nums">
                  {newInitialContent.length.toLocaleString("zh-TW")} / {MAX_AI_SKILL_CONTENT_LENGTH.toLocaleString("zh-TW")}
                </p>
              </div>
              <Button type="button" onClick={createGlobal} disabled={creating} className="gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                新增技能
              </Button>
            </div>

            {gListLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <div className="flex flex-wrap gap-2">
                {gList.map((row) => (
                  <Button
                    key={row.slug}
                    type="button"
                    variant={activeSlug === row.slug ? "default" : "outline"}
                    size="sm"
                    className="h-auto min-h-9 flex-col items-start gap-0.5 py-1.5"
                    onClick={() => openGlobal(row.slug)}
                  >
                    <span className="font-medium">{row.title}</span>
                    <span className="text-[10px] font-normal opacity-80">
                      代號 {row.slug} · {row.versionCount} 版
                    </span>
                  </Button>
                ))}
              </div>
            )}

            {activeSlug && (
              <>
                <Separator />
                {gDetailLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>顯示標題</Label>
                        <Input value={gTitle} onChange={(e) => setGTitle(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>排序（數字小者靠前）</Label>
                        <Input
                          type="number"
                          value={gSort}
                          onChange={(e) => setGSort(parseInt(e.target.value, 10) || 0)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>綁定 Agent 工具（JSON 陣列格式）</Label>
                      <Input
                        value={gToolBinding}
                        onChange={(e) => setGToolBinding(e.target.value)}
                        placeholder='例如：["course_plan","web_search"]'
                        className="font-mono text-sm"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        當此技能啟用時，Agent 將優先使用此處指定的工具。留空代表不綁定。
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>觸發條件（描述使用者意圖）</Label>
                      <Input
                        value={gTriggerCondition}
                        onChange={(e) => setGTriggerCondition(e.target.value)}
                        placeholder="例如：使用者詢問課程規劃或開班建議時觸發"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Agent 根據此描述判斷是否自動套用此技能脈絡。留空代表不自動觸發。
                      </p>
                    </div>
                    <Button type="button" variant="secondary" size="sm" onClick={saveGlobalMeta} disabled={gSaving}>
                      更新標題／排序／工具綁定
                    </Button>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="space-y-2 min-w-[14rem]">
                        <Label>版本</Label>
                        <Select
                          value={gSelectedNo === "" ? "" : String(gSelectedNo)}
                          onValueChange={onGlobalVersionChange}
                          disabled={gVersions.length === 0}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={gVersions.length ? "選擇版本" : "尚無版本"} />
                          </SelectTrigger>
                          <SelectContent>
                            {gVersions.map((v) => (
                              <SelectItem key={v.versionNo} value={String(v.versionNo)}>
                                第 {v.versionNo} 版 · {formatDateTime(v.createdAt)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={gSaving || gVersions.length === 0 || gSelectedNo === ""}
                        onClick={restoreGlobalAsNew}
                      >
                        將所選版本複製成新版本
                      </Button>
                    </div>
                    <Textarea
                      rows={14}
                      maxLength={MAX_AI_SKILL_CONTENT_LENGTH}
                      value={gDraft}
                      onChange={(e) => setGDraft(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="text-right text-xs text-muted-foreground tabular-nums">
                      {gDraft.length.toLocaleString("zh-TW")} / {MAX_AI_SKILL_CONTENT_LENGTH.toLocaleString("zh-TW")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" onClick={saveGlobalNewVersion} disabled={gSaving}>
                        {gSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        <span className="ml-2">儲存為新版本</span>
                      </Button>
                      <Badge variant="outline" className="font-normal">
                        編輯中 · 內部代號 {activeSlug}
                      </Badge>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
