"use client";

/**
 * 【相似度檢測設定】客製化 client component
 *
 * 取代舊版「純顯示唯讀區塊」。功能：
 *   1. admin 看到 5 個欄位的可編輯表單（slider + numeric input）
 *      - 預設門檻值（/api/similarity/check 的預設過濾分數）
 *      - 文字 / 向量引擎權重（兩者連動，永遠加總 100%）
 *      - 沿用建議 threshold（課程規劃幫手 reuseRecommended）
 *      - 參考建議 threshold（課程規劃幫手 hasReferences）
 *   2. non-admin 看到唯讀數值版（與舊版近似）
 *   3. 寫入後 30s in-memory cache 自動 invalidate；下一次 /api/similarity/check 會立刻拿到新值
 *
 * 設計考量：
 *   - 文字 / 向量權重永遠加總 100%：拖動其一時自動把另一個補成 1 - x，避免使用者算錯
 *   - reuse > reference：UI 端強制驗證（紅字提示）+ server 端 saveSimilarityConfig 也會校正
 *   - 「重置為預設值」按鈕一鍵恢復，避免拖壞之後不知道原值
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GitCompareArrows, Loader2, RefreshCw, Save, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/toaster";
import { readResponseJson } from "@/lib/read-response-json";

interface SimilarityConfig {
  defaultThreshold: number;
  lexicalWeight: number;
  vectorWeight: number;
  reuseThreshold: number;
  referenceThreshold: number;
}

interface ConfigResponse {
  config: SimilarityConfig;
  defaults: SimilarityConfig;
}

interface Props {
  isAdmin: boolean;
}

const FORMULA_TEXT = "(向量 × 向量權重 + 文字 × 文字權重) × 60% + 規則 × 40%";

/** 把 0.7321 → "73%" */
function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** 兩個權重連動：拖一個 → 另一個自動補成 1 - x，並 round 到小數兩位 */
function pairWeights(value: number, which: "lex" | "vec"): { lexicalWeight: number; vectorWeight: number } {
  const clamped = Math.min(1, Math.max(0, value));
  const a = Math.round(clamped * 100) / 100;
  const b = Math.round((1 - a) * 100) / 100;
  return which === "lex"
    ? { lexicalWeight: a, vectorWeight: b }
    : { lexicalWeight: b, vectorWeight: a };
}

export function SimilaritySettings({ isAdmin }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [config, setConfig] = useState<SimilarityConfig | null>(null);
  const [defaults, setDefaults] = useState<SimilarityConfig | null>(null);
  const [draft, setDraft] = useState<SimilarityConfig | null>(null);

  // 讀取目前設定
  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/similarity/config", { cache: "no-store" });
      if (!res.ok) {
        // non-admin 會被擋在 403；UI 改顯示靜態 fallback（與舊版同的「程式預設值」）
        if (res.status === 401 || res.status === 403) {
          const fallback: SimilarityConfig = {
            defaultThreshold: 0.75,
            lexicalWeight: 0.4,
            vectorWeight: 0.6,
            reuseThreshold: 0.85,
            referenceThreshold: 0.65,
          };
          setConfig(fallback);
          setDefaults(fallback);
          setDraft(fallback);
          return;
        }
        throw new Error(`讀取失敗 HTTP ${res.status}`);
      }
      const data = await readResponseJson<ConfigResponse>(res);
      setConfig(data.config);
      setDefaults(data.defaults);
      setDraft(data.config);
    } catch (e) {
      toast(`讀取相似度設定失敗：${(e as Error).message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const dirty = useMemo(() => {
    if (!config || !draft) return false;
    return (
      config.defaultThreshold !== draft.defaultThreshold ||
      config.lexicalWeight !== draft.lexicalWeight ||
      config.vectorWeight !== draft.vectorWeight ||
      config.reuseThreshold !== draft.reuseThreshold ||
      config.referenceThreshold !== draft.referenceThreshold
    );
  }, [config, draft]);

  // reference 必須 < reuse；client 端立刻提示
  const validationError = useMemo(() => {
    if (!draft) return null;
    if (draft.referenceThreshold >= draft.reuseThreshold) {
      return `「參考建議門檻」(${pct(draft.referenceThreshold)}) 必須低於「沿用建議門檻」(${pct(draft.reuseThreshold)})`;
    }
    return null;
  }, [draft]);

  const handleSave = useCallback(async () => {
    if (!draft || !isAdmin) return;
    if (validationError) {
      toast(validationError, "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/similarity/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const err = await readResponseJson<{ error?: string }>(res).catch(() => ({}) as { error?: string });
        throw new Error(err?.error ?? `儲存失敗 HTTP ${res.status}`);
      }
      const data = await readResponseJson<{ config: SimilarityConfig; message?: string }>(res);
      setConfig(data.config);
      setDraft(data.config);
      toast(data.message ?? "已儲存", "success");
    } catch (e) {
      toast(`儲存失敗：${(e as Error).message}`, "error");
    } finally {
      setSaving(false);
    }
  }, [draft, isAdmin, validationError, toast]);

  const handleReset = useCallback(async () => {
    if (!isAdmin) return;
    if (!confirm("確定要重置為程式預設值嗎？\n（預設門檻 75%、文字 40% / 向量 60%、沿用 85%、參考 65%）")) return;
    setResetting(true);
    try {
      const res = await fetch("/api/admin/similarity/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      if (!res.ok) {
        const err = await readResponseJson<{ error?: string }>(res).catch(() => ({}) as { error?: string });
        throw new Error(err?.error ?? `重置失敗 HTTP ${res.status}`);
      }
      const data = await readResponseJson<{ config: SimilarityConfig; message?: string }>(res);
      setConfig(data.config);
      setDraft(data.config);
      toast(data.message ?? "已重置為預設值", "success");
    } catch (e) {
      toast(`重置失敗：${(e as Error).message}`, "error");
    } finally {
      setResetting(false);
    }
  }, [isAdmin, toast]);

  // ---- Render ----

  if (loading || !draft) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GitCompareArrows className="w-4 h-4 text-primary" />
            相似度檢測設定
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            讀取中…
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---- non-admin：唯讀版（保留資訊性顯示） ----
  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GitCompareArrows className="w-4 h-4 text-primary" />
            相似度檢測設定
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-muted-foreground">預設門檻值</p>
              <p className="font-medium">
                {draft.defaultThreshold.toFixed(2)}（{pct(draft.defaultThreshold)}）
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">計算公式</p>
              <p className="font-medium">{FORMULA_TEXT}</p>
            </div>
            <div>
              <p className="text-muted-foreground">文字引擎權重</p>
              <p className="font-medium">
                {pct(draft.lexicalWeight)} <Badge variant="outline" className="ml-1">Jaccard + Bigram</Badge>
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">向量引擎權重</p>
              <p className="font-medium">
                {pct(draft.vectorWeight)} <Badge variant="outline" className="ml-1">Embedding + pgvector（v4.0）</Badge>
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">沿用建議門檻</p>
              <p className="font-medium">{pct(draft.reuseThreshold)}（課程規劃幫手「強烈建議沿用既有班」）</p>
            </div>
            <div>
              <p className="text-muted-foreground">參考建議門檻</p>
              <p className="font-medium">{pct(draft.referenceThreshold)}（課程規劃幫手「中度相似可參考」）</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            v4.0 採用「雙引擎」：向量嵌入（AI 判讀語意）+ 文字字詞（Jaccard/bigram 抓字面近似），
            在資料庫端以 pgvector HNSW 索引加速語意搜尋，再疊加開班條件（院區、類別、難度等）規則分數，全面提升相似度判斷準確度。
          </p>
          <p className="text-xs text-muted-foreground italic">※ 目前以唯讀模式顯示；如需調整參數請聯繫系統管理員。</p>
        </CardContent>
      </Card>
    );
  }

  // ---- admin：可編輯版 ----
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <GitCompareArrows className="w-4 h-4 text-primary" />
          相似度檢測設定
          {dirty && (
            <Badge variant="outline" className="ml-2 text-xs">
              尚未儲存
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <SliderRow
          label="預設門檻值"
          help="／api/similarity/check 的預設過濾分數；request body 帶的 threshold 會覆蓋此值。"
          min={0.3}
          max={0.99}
          step={0.01}
          value={draft.defaultThreshold}
          onChange={(v) => setDraft({ ...draft, defaultThreshold: v })}
          defaultValue={defaults?.defaultThreshold}
        />

        <div className="rounded-md border p-3 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>文字 / 向量引擎權重（兩者永遠加總 100%）</span>
            <span>
              <Badge variant="outline" className="mr-1">Jaccard + Bigram</Badge>
              <Badge variant="outline">Embedding + pgvector</Badge>
            </span>
          </div>
          <SliderRow
            label="文字引擎權重"
            help="調這一個，向量會自動補成 100% − 文字。"
            min={0}
            max={1}
            step={0.05}
            value={draft.lexicalWeight}
            onChange={(v) => setDraft({ ...draft, ...pairWeights(v, "lex") })}
            defaultValue={defaults?.lexicalWeight}
            compact
          />
          <SliderRow
            label="向量引擎權重"
            help="調這一個，文字會自動補成 100% − 向量。"
            min={0}
            max={1}
            step={0.05}
            value={draft.vectorWeight}
            onChange={(v) => setDraft({ ...draft, ...pairWeights(v, "vec") })}
            defaultValue={defaults?.vectorWeight}
            compact
          />
          <p className="text-xs text-muted-foreground">
            目前公式：<span className="font-mono">(向量 × {pct(draft.vectorWeight)} + 文字 × {pct(draft.lexicalWeight)}) × 60% + 規則 × 40%</span>
          </p>
        </div>

        <SliderRow
          label="沿用建議門檻"
          help="課程規劃幫手「強烈建議沿用既有班」的觸發分數（reuseRecommended）。"
          min={0.6}
          max={0.99}
          step={0.01}
          value={draft.reuseThreshold}
          onChange={(v) => setDraft({ ...draft, reuseThreshold: v })}
          defaultValue={defaults?.reuseThreshold}
        />
        <SliderRow
          label="參考建議門檻"
          help="課程規劃幫手「中度相似可參考」的觸發分數（hasReferences）；必須低於沿用建議門檻。"
          min={0.3}
          max={0.95}
          step={0.01}
          value={draft.referenceThreshold}
          onChange={(v) => setDraft({ ...draft, referenceThreshold: v })}
          defaultValue={defaults?.referenceThreshold}
        />

        {validationError && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          v4.0 採用「雙引擎」：向量嵌入（AI 判讀語意）+ 文字字詞（Jaccard/bigram 抓字面近似），在資料庫端以 pgvector HNSW 索引加速語意搜尋，再疊加開班條件（院區、類別、難度等）規則分數。
          <br />
          <span className="opacity-70">※ 儲存後最多 30 秒內所有相似度檢測（含「開班相似度檢測」、「課程規劃幫手」）會生效。</span>
        </p>

        <div className="flex items-center gap-2 pt-1">
          <Button onClick={handleSave} disabled={!dirty || saving || !!validationError}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            儲存
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={resetting}>
            {resetting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            重置為預設值
          </Button>
          {dirty && (
            <Button variant="ghost" onClick={() => config && setDraft(config)} disabled={saving}>
              還原本次修改
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// 小元件：slider + numeric input 並排，附「預設值」回復按鈕
// ============================================================

interface SliderRowProps {
  label: string;
  help?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  defaultValue?: number;
  /** compact 模式：用在「文字 / 向量權重」群組內，少留一些 padding */
  compact?: boolean;
}

function SliderRow({ label, help, min, max, step, value, onChange, defaultValue, compact }: SliderRowProps) {
  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm tabular-nums w-14 text-right">{pct(value)}</span>
          <Input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
            }}
            className="h-7 w-20 text-xs"
          />
          {typeof defaultValue === "number" && Math.abs(defaultValue - value) > 0.001 && (
            <button
              type="button"
              onClick={() => onChange(defaultValue)}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              title={`回到預設值 ${pct(defaultValue)}`}
            >
              預設
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 cursor-pointer accent-primary"
      />
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}
