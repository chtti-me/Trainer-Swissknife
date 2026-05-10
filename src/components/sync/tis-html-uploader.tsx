"use client";

/**
 * 【TIS HTML 上傳同步元件】
 *
 * 用法：使用者把從 TIS 「開班計畫表列表頁」另存的 HTML（一份或多份月份）拖進來，
 * 元件呼叫 /api/sync/tis/ingest 取得 dry-run diff，
 * 預覽後使用者按「確認匯入」呼叫 /api/sync/tis/confirm 寫入 DB。
 *
 * 設計重點：
 *   - 全程兩階段（preview → confirm），避免誤蓋
 *   - 顯示按月份分組的「新增 / 更新 / 未變」統計
 *   - 詳細項目摺疊（預設摺起來，使用者要看才展開）
 *   - 上傳檔案大小無限制（client 端讀檔，後端 parse；TIS 一個月 HTML 通常 50-200KB）
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  ChevronDown,
  ChevronRight,
  Cloud,
  Bookmark,
  ArrowDown,
} from "lucide-react";
import { useToast } from "@/components/ui/toaster";

interface PageSummary {
  sourceName: string | null;
  yy: number | null;
  mm: number | null;
  department: string | null;
  pageTitle: string | null;
  loginUser: string | null;
  classCount: number;
  warnings: string[];
}

interface ParsedClass {
  classCode: string;
  className: string;
  startDate: string | null;
  status: string | null;
  mentorName: string | null;
  enrollmentCount: number | null;
  tisSeq: string | null;
}

interface DiffEntry {
  parsed: ParsedClass;
  matchedDbId: string | null;
  matchedBy: "classCode" | "tisSeq" | "none";
  action: "create" | "update" | "noop";
  changedFields: string[];
}

interface DiffSummary {
  totalParsed: number;
  toCreate: number;
  toUpdate: number;
  noop: number;
  byMonth: Array<{ key: string; total: number; create: number; update: number; noop: number }>;
}

interface IngestResponse {
  parsedSummary: {
    totalPages: number;
    totalRowsParsed: number;
    totalDuplicatesAcrossPages: number;
    skipped: number;
    pages: PageSummary[];
  };
  diff: {
    summary: DiffSummary;
    entries: DiffEntry[];
  };
}

interface ConfirmResponse {
  syncJobId: string;
  totalCount: number;
  createdCount: number;
  updatedCount: number;
  noopCount: number;
  failedCount: number;
  errors: Array<{ classCode: string; message: string }>;
}

interface FileEntry {
  file: File;
  content: string;
}

export interface TisHtmlUploaderProps {
  /** 同步完成後（成功/部分成功）回呼，例如讓上層 refetch SyncJob 列表 */
  onSyncDone?: () => void;
}

export function TisHtmlUploader({ onSyncDone }: TisHtmlUploaderProps) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const stagingProcessed = useRef<Set<string>>(new Set());
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [ingestResult, setIngestResult] = useState<IngestResponse | null>(null);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  /** 標記目前 files 是來自 bookmarklet（顯示徽章用），與其 staging id（confirm 完成時 PATCH） */
  const [stagingId, setStagingId] = useState<string | null>(null);
  /** dry-run 結果區 ref — 解析完成後 auto-scroll 過去，避免使用者看不到「確認匯入」按鈕 */
  const resultRef = useRef<HTMLDivElement | null>(null);

  function resetAll() {
    setFiles([]);
    setIngestResult(null);
    setShowAllEntries(false);
    setStagingId(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function readFiles(list: FileList | File[]) {
    const arr = Array.from(list).filter((f) => /\.html?$/i.test(f.name));
    if (arr.length === 0) {
      toast("請選擇 .html 或 .htm 檔案", "error");
      return;
    }
    const entries: FileEntry[] = [];
    for (const f of arr) {
      try {
        const content = await f.text();
        entries.push({ file: f, content });
      } catch {
        toast(`讀取 ${f.name} 失敗`, "error");
      }
    }
    setFiles((prev) => [...prev, ...entries]);
    setIngestResult(null);
  }

  const runAnalyze = useCallback(
    async (entries: FileEntry[]) => {
      if (entries.length === 0) return;
      setAnalyzing(true);
      setIngestResult(null);
      try {
        const fd = new FormData();
        for (const e of entries) fd.append("files", e.file);
        const res = await fetch("/api/sync/tis/ingest", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          toast(`分析失敗：${data.error ?? res.statusText}`, "error");
          return;
        }
        setIngestResult(data as IngestResponse);
        const r = data as IngestResponse;
        toast(
          `已解析 ${r.parsedSummary.totalRowsParsed} 班；新增 ${r.diff.summary.toCreate}、更新 ${r.diff.summary.toUpdate}、未變 ${r.diff.summary.noop}`,
          "success"
        );
      } catch (e) {
        toast(`分析失敗：${String(e)}`, "error");
      } finally {
        setAnalyzing(false);
      }
    },
    [toast]
  );

  async function handleAnalyze() {
    await runAnalyze(files);
  }

  /** dry-run 完成後 auto-scroll 到結果區，避免使用者沒看到「確認匯入」按鈕 */
  useEffect(() => {
    if (ingestResult && resultRef.current) {
      // 等下一幀 paint 後再 scroll，確保 DOM 已 layout
      requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [ingestResult]);

  /**
   * 接收來自 bookmarklet 的 staging：
   *   /sync?tisStagingId=xxx → fetch GET /api/sync/tis/staging/[id]
   *   → 把 items 包成 FileEntry → setFiles + 自動 analyze
   */
  useEffect(() => {
    const id = searchParams?.get("tisStagingId");
    if (!id) return;
    if (stagingProcessed.current.has(id)) return;
    stagingProcessed.current.add(id);

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sync/tis/staging/${id}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast(`載入 bookmarklet 抓取資料失敗：${data.error ?? res.statusText}`, "error");
          return;
        }
        const data = (await res.json()) as {
          items: Array<{ name: string; content: string }>;
        };
        if (cancelled) return;
        const entries: FileEntry[] = data.items.map((it) => ({
          file: new File([it.content], it.name, { type: "text/html" }),
          content: it.content,
        }));
        if (entries.length === 0) {
          toast("Staging 內容為空", "error");
          return;
        }
        setFiles(entries);
        setStagingId(id);
        toast(`從 bookmarklet 收到 ${entries.length} 份 HTML，自動分析中…`, "info");
        await runAnalyze(entries);
      } catch (e) {
        if (!cancelled) toast(`載入失敗：${String(e)}`, "error");
      } finally {
        // 清掉 query string，避免 reload 時重複觸發
        if (!cancelled) {
          router.replace("/sync");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handleConfirm() {
    if (!ingestResult || files.length === 0) return;
    setConfirming(true);
    try {
      const body = {
        htmls: files.map((f) => ({ name: f.file.name, content: f.content })),
        sourceLabel: `TIS HTML 上傳：${files.length} 月份 (${files
          .map((f) => f.file.name)
          .slice(0, 3)
          .join(", ")}${files.length > 3 ? "..." : ""})`,
      };
      const res = await fetch("/api/sync/tis/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as ConfirmResponse | { error: string };
      if (!res.ok || "error" in data) {
        toast(`匯入失敗：${"error" in data ? data.error : res.statusText}`, "error");
        return;
      }
      const r = data as ConfirmResponse;
      toast(
        `匯入完成：新增 ${r.createdCount}、更新 ${r.updatedCount}、未變 ${r.noopCount}${
          r.failedCount > 0 ? `、失敗 ${r.failedCount}` : ""
        }`,
        r.failedCount > 0 ? "info" : "success"
      );
      // 若來源是 staging，標記 consumed（不阻擋主流程）
      if (stagingId) {
        fetch(`/api/sync/tis/staging/${stagingId}`, { method: "PATCH" }).catch(() => {});
      }
      resetAll();
      onSyncDone?.();
    } catch (e) {
      toast(`匯入失敗：${String(e)}`, "error");
    } finally {
      setConfirming(false);
    }
  }

  const summary = ingestResult?.diff.summary;
  const entries = ingestResult?.diff.entries ?? [];
  const visibleEntries = showAllEntries ? entries : entries.filter((e) => e.action !== "noop").slice(0, 30);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cloud className="w-4 h-4 text-blue-600" />
          TIS HTML 同步
          <Badge variant="outline" className="text-xs ml-1">只讀</Badge>
          {stagingId && (
            <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100 text-xs">
              <Bookmark className="w-3 h-3 mr-1" />
              來自 Bookmarklet
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          兩種來源：(1) 直接拖檔 — 在 TIS 用瀏覽器另存「開班計畫表」HTML 後拖到下方；
          (2) Bookmarklet 一鍵抓 — 在 /settings 拖書籤到瀏覽器書籤列，於 TIS 點該書籤即可自動回傳到此頁。
          兩種都會走同一個 dry-run 預覽 → 確認匯入流程。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void readFiles(e.dataTransfer.files);
          }}
          className={`border-2 border-dashed rounded-lg p-6 text-center transition ${
            dragOver
              ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
              : "border-muted-foreground/30 hover:border-blue-400"
          }`}
        >
          <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-sm mt-2">把 .html 檔拖到這裡</p>
          <p className="text-xs text-muted-foreground mt-1">或</p>
          <input
            ref={fileRef}
            type="file"
            accept=".html,.htm"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void readFiles(e.target.files);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => fileRef.current?.click()}
            type="button"
          >
            選擇檔案
          </Button>
        </div>

        {files.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                已選 {files.length} 檔，共{" "}
                {(files.reduce((sum, f) => sum + f.content.length, 0) / 1024).toFixed(1)} KB
              </p>
              <Button variant="ghost" size="sm" onClick={resetAll} type="button">
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                清空
              </Button>
            </div>
            <div className="border rounded p-2 max-h-32 overflow-auto">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate">{f.file.name}</span>
                  <span className="text-muted-foreground">{(f.file.size / 1024).toFixed(1)}KB</span>
                </div>
              ))}
            </div>
            <Button onClick={handleAnalyze} disabled={analyzing || confirming} className="w-full">
              {analyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  解析中…
                </>
              ) : (
                <>解析並預覽差異</>
              )}
            </Button>
          </div>
        )}

        {ingestResult && summary && (
          <div ref={resultRef} className="space-y-3 border-t pt-4 scroll-mt-4">
            {/* 醒目橙色 banner：強調「dry-run 完成 ≠ 匯入完成」這個常被誤解的概念 */}
            <div className="flex items-start gap-3 rounded-lg border-2 border-orange-300 bg-orange-50 dark:bg-orange-950/20 p-3">
              <ArrowDown className="w-5 h-5 text-orange-600 shrink-0 mt-0.5 animate-bounce" />
              <div className="flex-1 text-sm">
                <p className="font-semibold text-orange-900 dark:text-orange-200">
                  ⚠️ 解析完成，但<u>尚未</u>寫入資料庫
                </p>
                <p className="text-xs text-orange-800/80 dark:text-orange-300/80 mt-0.5">
                  這只是預覽差異（dry-run）。請檢查下方數字後，點本區塊最下方的
                  「<strong>確認匯入</strong>」按鈕，才會實際寫入 TrainingClass，並在「匯入 / 同步記錄」中留下紀錄。
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <p className="text-sm font-medium">解析完成</p>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="border rounded p-2">
                <p className="text-xs text-muted-foreground">解析總數</p>
                <p className="text-lg font-semibold">{summary.totalParsed}</p>
              </div>
              <div className="border rounded p-2 bg-green-50 dark:bg-green-950/20">
                <p className="text-xs text-muted-foreground">新增</p>
                <p className="text-lg font-semibold text-green-700 dark:text-green-400">
                  {summary.toCreate}
                </p>
              </div>
              <div className="border rounded p-2 bg-amber-50 dark:bg-amber-950/20">
                <p className="text-xs text-muted-foreground">更新</p>
                <p className="text-lg font-semibold text-amber-700 dark:text-amber-400">
                  {summary.toUpdate}
                </p>
              </div>
              <div className="border rounded p-2">
                <p className="text-xs text-muted-foreground">未變</p>
                <p className="text-lg font-semibold text-muted-foreground">{summary.noop}</p>
              </div>
            </div>

            {summary.byMonth.length > 1 && (
              <div className="border rounded">
                <p className="text-xs font-medium px-3 py-1.5 bg-muted">按月份分組</p>
                <div className="text-xs">
                  {summary.byMonth.map((m) => (
                    <div
                      key={m.key}
                      className="flex items-center gap-3 px-3 py-1 border-t first:border-t-0"
                    >
                      <span className="font-mono w-20">{m.key}</span>
                      <span className="flex-1 text-muted-foreground">共 {m.total} 班</span>
                      {m.create > 0 && (
                        <span className="text-green-600">＋{m.create}</span>
                      )}
                      {m.update > 0 && (
                        <span className="text-amber-600">~{m.update}</span>
                      )}
                      {m.noop > 0 && (
                        <span className="text-muted-foreground">={m.noop}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ingestResult.parsedSummary.pages.some((p) => p.warnings.length > 0) && (
              <div className="border border-amber-300 bg-amber-50 dark:bg-amber-950/20 rounded p-2 text-xs">
                <div className="flex items-center gap-1 font-medium text-amber-800 dark:text-amber-300">
                  <AlertCircle className="w-3.5 h-3.5" />
                  解析警告
                </div>
                {ingestResult.parsedSummary.pages
                  .filter((p) => p.warnings.length > 0)
                  .map((p, i) => (
                    <div key={i} className="mt-1">
                      <span className="font-medium">{p.sourceName}：</span>
                      {p.warnings.join("；")}
                    </div>
                  ))}
              </div>
            )}

            {entries.length > 0 && (
              <div className="border rounded">
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-1.5 bg-muted text-xs font-medium hover:bg-muted/80"
                  onClick={() => setShowAllEntries((v) => !v)}
                >
                  {showAllEntries ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                  詳細項目（{visibleEntries.length}/{entries.length}）
                  {!showAllEntries && summary.toCreate + summary.toUpdate > 30 && (
                    <span className="text-muted-foreground">— 點擊展開所有</span>
                  )}
                </button>
                <div className="max-h-64 overflow-auto text-xs">
                  {visibleEntries.map((e, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-3 py-1 border-t first:border-t-0"
                    >
                      <Badge
                        variant={
                          e.action === "create"
                            ? "default"
                            : e.action === "update"
                              ? "secondary"
                              : "outline"
                        }
                        className={`text-[10px] w-12 justify-center ${
                          e.action === "create"
                            ? "bg-green-600"
                            : e.action === "update"
                              ? "bg-amber-500"
                              : ""
                        }`}
                      >
                        {e.action === "create" ? "新增" : e.action === "update" ? "更新" : "未變"}
                      </Badge>
                      <span className="font-mono w-24 truncate">{e.parsed.classCode}</span>
                      <span className="flex-1 truncate">{e.parsed.className}</span>
                      <span className="text-muted-foreground w-20 text-right">
                        {e.parsed.startDate ?? "—"}
                      </span>
                      <span className="text-muted-foreground w-20 truncate">
                        {e.parsed.mentorName ?? "—"}
                      </span>
                      {e.action === "update" && e.changedFields.length > 0 && (
                        <span className="text-amber-600 truncate max-w-[200px]" title={e.changedFields.join(", ")}>
                          ({e.changedFields.length} 欄位)
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 確認匯入按鈕區塊 ── 視覺強化 */}
            <div className="space-y-2 pt-2 border-t">
              {/* 沒有任何要寫入的變更時，顯式說明為什麼按鈕灰掉 */}
              {summary.toCreate === 0 && summary.toUpdate === 0 ? (
                <div className="rounded-lg bg-slate-100 dark:bg-slate-800/50 p-3 text-sm text-center">
                  <p className="font-medium text-slate-700 dark:text-slate-200">
                    ✅ 資料庫內容已與 TIS 同步，沒有需要新增或更新的班次
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    （{summary.noop} 筆全部「未變」；無需匯入。可以直接關閉本頁。）
                  </p>
                </div>
              ) : (
                <p className="text-xs text-center text-orange-700 dark:text-orange-300 font-medium">
                  ⬇️ 點下方按鈕完成匯入 ⬇️
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  onClick={handleConfirm}
                  disabled={confirming || (summary.toCreate === 0 && summary.toUpdate === 0)}
                  className={
                    summary.toCreate + summary.toUpdate > 0
                      ? "flex-1 h-12 text-base font-semibold bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-600/30 ring-2 ring-orange-300 ring-offset-2 animate-pulse hover:animate-none"
                      : "flex-1"
                  }
                >
                  {confirming ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      匯入中…
                    </>
                  ) : (
                    <>
                      ✅ 確認匯入（{summary.toCreate + summary.toUpdate} 筆）
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={resetAll} disabled={confirming} type="button">
                  取消
                </Button>
              </div>
              {stagingId && (
                <p className="text-[10px] text-muted-foreground text-center">
                  資料來源：bookmarklet staging <code className="font-mono">{stagingId.slice(0, 8)}…</code>
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
