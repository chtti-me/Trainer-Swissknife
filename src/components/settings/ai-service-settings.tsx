"use client";

/**
 * 【AI 服務設定】客製化 client component
 *
 * 取代舊版「3 個唯讀 input」的設計。功能：
 *   1. 列出 6 家 supported AI provider（catalog 從後端 GET /api/admin/ai-providers/catalog）
 *   2. 每家卡片顯示：申請 key 連結、env 變數對應、一鍵複製、free tier 提示
 *   3. 「測試 + 列模型」流程：管理員貼 key → 測試 → 顯示可用模型 → 每個 model 一鍵複製成 KEY=value
 *   4. Fallback 設定區：啟用 / chain 順序（上下箭頭）/ thresholds（錯誤狀態碼、cool down 秒數）/ 即時狀態
 *
 * 注意：
 *   - 所有 API key 操作都不會寫入 server env / DB；只在當下 ad-hoc 拿去打 list-models
 *   - Render 部署版的 API key **必須**還是要在 Render dashboard 設環境變數；本 UI 只是「設定協助器」
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Brain,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  Sparkles,
  Info,
} from "lucide-react";
import { useToast } from "@/components/ui/toaster";
import { readResponseJson } from "@/lib/read-response-json";

// ---------- 與後端共用的型別（重複宣告而非 import server-only 模組） ----------

type AiProvider = "openai" | "gemini" | "groq" | "nvidia" | "openrouter" | "xai";

interface CatalogItem {
  id: AiProvider;
  displayName: string;
  shortDescription: string;
  apiKeyConsoleUrl: string;
  defaultBaseUrl: string;
  defaultChatModel: string;
  defaultPlanningModel: string | null;
  defaultEmbeddingModel: string | null;
  envVars: {
    apiKey: string;
    baseUrl: string;
    chatModel: string;
    planningModel?: string;
    embeddingModel?: string;
  };
  freeTierNote: string | null;
  /** 地理限制警告（目前僅 Gemini 有；UI 顯示醒目 banner） */
  geoRestrictionWarning: string | null;
  /** catalog 預設是否啟用（資訊用，UI 顯示「Recommended」） */
  enabledByDefault: boolean;
  brandColor: string;
  apiKeyConfigured: boolean;
}

interface CatalogResponse {
  defaultProvider: AiProvider;
  items: CatalogItem[];
}

interface ListedModel {
  id: string;
  ownedBy: string | null;
  contextLength: number | null;
  isFree: boolean;
}

interface TestResponse {
  ok: boolean;
  error: string | null;
  status: number | null;
  provider: AiProvider;
  catalog: {
    defaultBaseUrl: string;
    defaultChatModel: string;
    envVarApiKey: string;
    envVarBaseUrl: string;
    envVarChatModel: string;
  };
  models: ListedModel[];
}

interface ChainEntry {
  provider: AiProvider;
  enabled: boolean;
}

interface Thresholds {
  dailyRequestSoftLimit: number | null;
  switchOnErrorStatuses: number[];
  consecutiveErrorThreshold: number;
  cooldownSeconds: number;
}

interface FallbackConfig {
  enabled: boolean;
  chain: ChainEntry[];
  thresholds: Thresholds;
}

interface ProviderUsage {
  successCount: number;
  errorCount: number;
  switchOutCount: number;
  lastSuccessAt: number;
  lastErrorAt: number;
  lastErrorMessage: string | null;
  cooldownUntil: number;
}

interface RuntimeStats {
  fallbackEnabled: boolean;
  chain: ChainEntry[];
  usage: Array<{ provider: AiProvider; usage: ProviderUsage; inCooldown: boolean }>;
  serverTime: string;
}

// ---------- 小工具 ----------

const BRAND_RING: Record<string, string> = {
  blue: "border-blue-200 hover:border-blue-300 bg-blue-50/30",
  purple: "border-purple-200 hover:border-purple-300 bg-purple-50/30",
  orange: "border-orange-200 hover:border-orange-300 bg-orange-50/30",
  green: "border-green-200 hover:border-green-300 bg-green-50/30",
  slate: "border-slate-200 hover:border-slate-300 bg-slate-50/30",
  zinc: "border-zinc-200 hover:border-zinc-300 bg-zinc-50/30",
};

function formatRelativeTime(epoch: number): string {
  if (!epoch) return "—";
  const diff = Date.now() - epoch;
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))} 秒前`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分鐘前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小時前`;
  return new Date(epoch).toLocaleString("zh-TW");
}

// ---------- 主 component ----------

export function AiServiceSettings() {
  const { toast } = useToast();

  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [config, setConfig] = useState<FallbackConfig | null>(null);
  const [stats, setStats] = useState<RuntimeStats | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const res = await fetch("/api/admin/ai-providers/catalog");
      const data = await readResponseJson<CatalogResponse>(res);
      if (!res.ok) throw new Error("載入 provider catalog 失敗");
      setCatalog(data);
    } catch (e) {
      toast(`載入供應商清單失敗：${String(e)}`, "error");
    } finally {
      setCatalogLoading(false);
    }
  }, [toast]);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ai-config");
      const data = await readResponseJson<FallbackConfig>(res);
      if (res.ok) setConfig(data);
    } catch {
      // ignore；UI 顯示「未設定」
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ai-config/runtime-stats");
      const data = await readResponseJson<RuntimeStats>(res);
      if (res.ok) setStats(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadCatalog();
    loadConfig();
    loadStats();
  }, [loadCatalog, loadConfig, loadStats]);

  // 每 15 秒 refresh runtime stats（看 fallback 觸發狀態）
  useEffect(() => {
    const t = setInterval(loadStats, 15_000);
    return () => clearInterval(t);
  }, [loadStats]);

  const saveConfig = useCallback(
    async (next: FallbackConfig) => {
      setSavingConfig(true);
      try {
        const res = await fetch("/api/admin/ai-config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        const data = await readResponseJson<FallbackConfig>(res);
        if (!res.ok) throw new Error("儲存失敗");
        setConfig(data);
        toast("已儲存 Fallback 設定，下一次 LLM 呼叫即生效", "success");
      } catch (e) {
        toast(`儲存失敗：${String(e)}`, "error");
      } finally {
        setSavingConfig(false);
      }
    },
    [toast]
  );

  const usageByProvider = useMemo(() => {
    const m = new Map<AiProvider, { usage: ProviderUsage; inCooldown: boolean }>();
    for (const u of stats?.usage ?? []) m.set(u.provider, { usage: u.usage, inCooldown: u.inCooldown });
    return m;
  }, [stats]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          AI 服務設定
        </CardTitle>
        <CardDescription>
          設定多家 AI 供應商與 fallback 順序。API key 必須在 <code className="bg-muted px-1 rounded">Render → Environment</code> 設定，本頁提供「測試 key、列模型、一鍵複製、設 fallback 順序」協助管理員配置。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 系統當前預設 + Fallback 啟用開關 */}
        {config && (
          <div className="border rounded-lg p-4 bg-amber-50/40 border-amber-200">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-semibold">
                  <Sparkles className="w-4 h-4 text-amber-700" />
                  Fallback Runtime（多供應商容錯）
                </div>
                <p className="text-sm text-muted-foreground">
                  啟用後，LLM 呼叫會依下方「順序」依序嘗試；遇到 400/429/5xx 等錯誤自動切換下一家，DEMO 場景不易因單一供應商配額用光而中斷。
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">{config.enabled ? "已啟用" : "未啟用"}</span>
                <Switch
                  checked={config.enabled}
                  onCheckedChange={(v) => saveConfig({ ...config, enabled: v })}
                  disabled={savingConfig}
                />
              </div>
            </div>
            {!config.enabled && (
              <p className="text-xs text-amber-800 mt-2 flex items-start gap-1">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                未啟用時系統會走預設單一 provider（=
                <code className="bg-white px-1 rounded mx-1">AI_PROVIDER</code>
                env，目前是 <strong>{catalog?.defaultProvider ?? "—"}</strong>），與舊版行為一致。
              </p>
            )}
          </div>
        )}

        {/* 6 家 provider 卡片 */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">支援的供應商</h3>
          {catalogLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              載入中…
            </div>
          ) : (
            <div className="grid gap-3">
              {(catalog?.items ?? []).map((p) => (
                <ProviderCard
                  key={p.id}
                  item={p}
                  usage={usageByProvider.get(p.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Fallback chain 順序 */}
        {config && (
          <FallbackChainEditor
            config={config}
            stats={stats}
            saving={savingConfig}
            catalog={catalog}
            onSave={saveConfig}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Provider 卡片 ----------

function ProviderCard({
  item,
  usage,
}: {
  item: CatalogItem;
  usage?: { usage: ProviderUsage; inCooldown: boolean };
}) {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResponse | null>(null);

  const ringClass = BRAND_RING[item.brandColor] ?? "border-slate-200 bg-slate-50/30";

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`已複製：${label}`, "success");
    } catch {
      toast("複製失敗（瀏覽器拒絕 clipboard 操作）", "error");
    }
  };

  const runTest = async () => {
    if (!apiKey || apiKey.length < 8) {
      toast("請先輸入 API key", "error");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/ai-providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: item.id, apiKey }),
      });
      const data = await readResponseJson<TestResponse>(res);
      setTestResult(data);
      if (data.ok) {
        toast(`${item.displayName} 測試通過，共回 ${data.models.length} 個模型`, "success");
      } else {
        toast(`${item.displayName} 測試失敗：${data.error || "未知錯誤"}`, "error");
      }
    } catch (e) {
      toast(`測試請求失敗：${String(e)}`, "error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className={`rounded-lg border-2 p-4 transition-colors ${ringClass}`}>
      {/* 標題列 */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-base">{item.displayName}</h4>
            {item.apiKeyConfigured ? (
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Key 已設定
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-300 text-amber-700">
                <XCircle className="w-3 h-3 mr-1" /> Key 未設定
              </Badge>
            )}
            {usage && usage.inCooldown && (
              <Badge variant="outline" className="border-rose-300 text-rose-700">
                Cool down 中
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{item.shortDescription}</p>
        </div>
        <a
          href={item.apiKeyConsoleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline flex items-center gap-1 shrink-0"
        >
          申請 / 管理 Key <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* 地理限制警告（Gemini 等供應商有 IP 區域檢查時顯示） */}
      {item.geoRestrictionWarning && (
        <div className="text-xs bg-rose-50 border border-rose-300 rounded p-2 mb-3 flex gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-rose-600" />
          <span className="text-rose-900">{item.geoRestrictionWarning}</span>
        </div>
      )}

      {/* Free tier 提示 */}
      {item.freeTierNote && (
        <div className="text-xs bg-white/60 border rounded p-2 mb-3 flex gap-2">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-600" />
          <span>{item.freeTierNote}</span>
        </div>
      )}

      {/* 即時統計 */}
      {usage && (usage.usage.successCount > 0 || usage.usage.errorCount > 0) && (
        <div className="text-xs flex flex-wrap gap-3 mb-3 p-2 bg-white/60 border rounded">
          <span className="flex items-center gap-1">
            <Activity className="w-3 h-3 text-emerald-600" />
            今日成功 {usage.usage.successCount}
          </span>
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            錯誤 {usage.usage.errorCount}
          </span>
          <span>切出 {usage.usage.switchOutCount}</span>
          {usage.usage.lastErrorMessage && (
            <span className="text-rose-700 truncate max-w-[280px]" title={usage.usage.lastErrorMessage}>
              最近錯誤：{usage.usage.lastErrorMessage}
            </span>
          )}
        </div>
      )}

      {/* Render 環境變數對照 */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">Render Environment Variables</p>
        <EnvRow envName={item.envVars.apiKey} value="<your-api-key>" placeholder copy={copy} />
        <EnvRow envName={item.envVars.baseUrl} value={item.defaultBaseUrl} copy={copy} />
        <EnvRow envName={item.envVars.chatModel} value={item.defaultChatModel} copy={copy} />
        {item.envVars.planningModel && item.defaultPlanningModel && (
          <EnvRow
            envName={item.envVars.planningModel}
            value={item.defaultPlanningModel}
            copy={copy}
          />
        )}
        {item.envVars.embeddingModel && item.defaultEmbeddingModel && (
          <EnvRow
            envName={item.envVars.embeddingModel}
            value={item.defaultEmbeddingModel}
            copy={copy}
          />
        )}
      </div>

      <Separator className="my-3" />

      {/* 測試 + 列模型 */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground">測試此供應商</Label>
        <div className="flex gap-2">
          <Input
            type={showKey ? "text" : "password"}
            placeholder={`貼上 ${item.envVars.apiKey} 測試…`}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="font-mono text-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowKey((v) => !v)}
            title={showKey ? "隱藏" : "顯示"}
          >
            {showKey ? "隱藏" : "顯示"}
          </Button>
          <Button type="button" size="sm" onClick={runTest} disabled={testing || !apiKey}>
            {testing ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                測試中
              </>
            ) : (
              "測試 + 列模型"
            )}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          僅在當下用此 key 呼叫 list-models 端點驗證；不會寫入伺服器或資料庫。
        </p>

        {testResult && (
          <div className="mt-2 border rounded bg-white/60">
            {testResult.ok ? (
              <div>
                <div className="px-3 py-2 text-xs flex items-center gap-2 border-b">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>共 {testResult.models.length} 個可用模型</span>
                </div>
                <div className="max-h-64 overflow-auto">
                  {testResult.models.slice(0, 60).map((m) => (
                    <ModelRow
                      key={m.id}
                      model={m}
                      envVarChatModel={item.envVars.chatModel}
                      copy={copy}
                    />
                  ))}
                  {testResult.models.length > 60 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      還有 {testResult.models.length - 60} 個模型未顯示…
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <TestErrorDisplay
                provider={item.id}
                error={testResult.error || "未知錯誤"}
                status={testResult.status}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EnvRow({
  envName,
  value,
  placeholder,
  copy,
}: {
  envName: string;
  value: string;
  placeholder?: boolean;
  copy: (text: string, label: string) => void;
}) {
  const fullEnvLine = `${envName}=${placeholder ? "<your-key-here>" : value}`;
  return (
    <div className="flex items-center gap-2 text-xs">
      <code className="bg-white border px-2 py-1 rounded font-mono shrink-0 text-blue-900">
        {envName}
      </code>
      <code
        className={`flex-1 px-2 py-1 rounded font-mono truncate ${
          placeholder ? "bg-amber-100 text-amber-900" : "bg-white border"
        }`}
      >
        {value}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-2"
        onClick={() => copy(value, envName)}
        title={`複製 ${value}`}
      >
        <Copy className="w-3 h-3" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-2"
        onClick={() => copy(fullEnvLine, `${envName}=...`)}
        title="複製整行 KEY=value"
      >
        <span className="text-[10px]">KEY=val</span>
      </Button>
    </div>
  );
}

/**
 * 「測試 + 列模型」失敗時的智能診斷顯示。
 * 偵測常見錯誤模式給出對應建議，避免管理員自行 google。
 */
function TestErrorDisplay({
  provider,
  error,
  status,
}: {
  provider: AiProvider;
  error: string;
  status: number | null;
}) {
  const lower = error.toLowerCase();

  // 已知錯誤模式 → 對應建議
  let diagnosis: { title: string; advice: string; severity: "high" | "medium" } | null = null;

  if (lower.includes("user location is not supported")) {
    diagnosis = {
      title: "Google Gemini 地理限制",
      advice:
        "免費 Gemini API key 對發起 server IP 做地理檢查，台灣家用 IP / Render Singapore region 都常踩到。建議改用 OpenRouter（也能用 Gemini Flash 模型且 server 在 US 無地理限制），或將 Gemini 升級為付費版。",
      severity: "high",
    };
  } else if (status === 401 || lower.includes("invalid api key") || lower.includes("unauthorized")) {
    diagnosis = {
      title: "API key 無效",
      advice: `這把 ${provider} key 沒被該供應商認可。請到「申請 / 管理 Key」頁重新取一把，或檢查貼上時前後有沒有多空白字元。`,
      severity: "high",
    };
  } else if (status === 429 || lower.includes("rate limit") || lower.includes("quota")) {
    diagnosis = {
      title: "用量已達上限",
      advice:
        "這把 key 短期內被叫太多次，或當日免費額度已用完。等候 cooldown / 隔日重置，或啟用 Fallback Runtime 自動切換到下一家供應商。",
      severity: "medium",
    };
  } else if (status === 403 || lower.includes("forbidden") || lower.includes("permission")) {
    diagnosis = {
      title: "權限不足",
      advice: `這把 ${provider} key 沒有「list models」權限，可能 scope 太窄或是過期。請重新生成一把預設權限的 key。`,
      severity: "high",
    };
  } else if (lower.includes("fetch failed") || lower.includes("network") || lower.includes("timeout")) {
    diagnosis = {
      title: "連不到供應商",
      advice:
        "Server 端 fetch 失敗，可能是供應商當下無回應 / 防火牆阻擋。Render Singapore 偶爾會有出口 IP 段被特定供應商擋的情況；稍後再試或換家。",
      severity: "medium",
    };
  } else if (status && status >= 500) {
    diagnosis = {
      title: "供應商伺服器錯誤",
      advice: "對方 server 5xx，與你的 key 無關。稍後再試。",
      severity: "medium",
    };
  }

  return (
    <div className="px-3 py-2 text-xs text-rose-700 space-y-2">
      <div className="flex items-start gap-2">
        <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-medium">失敗：{error}</p>
          {status && <p className="opacity-70">HTTP {status}</p>}
        </div>
      </div>
      {diagnosis && (
        <div
          className={`rounded p-2 flex gap-2 ${
            diagnosis.severity === "high"
              ? "bg-rose-100 border border-rose-300"
              : "bg-amber-50 border border-amber-300"
          }`}
        >
          <AlertTriangle
            className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
              diagnosis.severity === "high" ? "text-rose-600" : "text-amber-600"
            }`}
          />
          <div className="space-y-1">
            <p className={`font-semibold ${diagnosis.severity === "high" ? "text-rose-900" : "text-amber-900"}`}>
              診斷：{diagnosis.title}
            </p>
            <p className={diagnosis.severity === "high" ? "text-rose-800" : "text-amber-800"}>
              {diagnosis.advice}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ModelRow({
  model,
  envVarChatModel,
  copy,
}: {
  model: ListedModel;
  envVarChatModel: string;
  copy: (text: string, label: string) => void;
}) {
  return (
    <div className="px-3 py-1.5 text-xs flex items-center gap-2 border-b last:border-b-0 hover:bg-muted/40">
      <code className="font-mono flex-1 truncate" title={model.id}>
        {model.id}
      </code>
      {model.isFree && (
        <Badge variant="outline" className="border-emerald-300 text-emerald-700 text-[10px]">
          free
        </Badge>
      )}
      {model.contextLength != null && (
        <span className="text-muted-foreground">{(model.contextLength / 1000).toFixed(0)}k</span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-2"
        onClick={() => copy(model.id, model.id)}
        title="複製模型 ID"
      >
        <Copy className="w-3 h-3" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-2"
        onClick={() => copy(`${envVarChatModel}=${model.id}`, `${envVarChatModel}=${model.id}`)}
        title={`複製 ${envVarChatModel}=...`}
      >
        <span className="text-[10px]">KEY=val</span>
      </Button>
    </div>
  );
}

// ---------- Fallback Chain 編輯器 ----------

function FallbackChainEditor({
  config,
  stats,
  saving,
  catalog,
  onSave,
}: {
  config: FallbackConfig;
  stats: RuntimeStats | null;
  saving: boolean;
  catalog: CatalogResponse | null;
  onSave: (next: FallbackConfig) => void;
}) {
  const [draft, setDraft] = useState<FallbackConfig>(config);
  const [dirty, setDirty] = useState(false);
  const [statusInput, setStatusInput] = useState(config.thresholds.switchOnErrorStatuses.join(", "));
  const [softLimitInput, setSoftLimitInput] = useState(
    config.thresholds.dailyRequestSoftLimit?.toString() ?? ""
  );

  useEffect(() => {
    setDraft(config);
    setStatusInput(config.thresholds.switchOnErrorStatuses.join(", "));
    setSoftLimitInput(config.thresholds.dailyRequestSoftLimit?.toString() ?? "");
    setDirty(false);
  }, [config]);

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...draft.chain];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setDraft({ ...draft, chain: next });
    setDirty(true);
  };

  const toggleEnabled = (idx: number) => {
    const next = [...draft.chain];
    next[idx] = { ...next[idx], enabled: !next[idx].enabled };
    setDraft({ ...draft, chain: next });
    setDirty(true);
  };

  const submit = () => {
    const statuses = statusInput
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    const softLimitNum = softLimitInput.trim() === "" ? null : parseInt(softLimitInput.trim(), 10);
    const next: FallbackConfig = {
      ...draft,
      thresholds: {
        ...draft.thresholds,
        switchOnErrorStatuses: statuses,
        dailyRequestSoftLimit:
          softLimitNum != null && Number.isFinite(softLimitNum) && softLimitNum > 0
            ? softLimitNum
            : null,
      },
    };
    onSave(next);
  };

  const usageMap = new Map(stats?.usage.map((u) => [u.provider, u]));
  const catalogMap = new Map(catalog?.items.map((c) => [c.id, c]));

  return (
    <div className="space-y-4 border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Fallback 順序</h3>
        {dirty && (
          <Button size="sm" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
            儲存變更
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {draft.chain.map((entry, idx) => {
          const cat = catalogMap.get(entry.provider);
          const usage = usageMap.get(entry.provider);
          const hasKey = cat?.apiKeyConfigured ?? false;
          return (
            <div
              key={entry.provider}
              className={`flex items-center gap-2 p-2 border rounded ${
                entry.enabled ? "bg-white" : "bg-muted/40 opacity-70"
              }`}
            >
              <span className="text-xs font-mono w-6 text-center text-muted-foreground">
                #{idx + 1}
              </span>
              <Switch
                checked={entry.enabled}
                onCheckedChange={() => toggleEnabled(idx)}
                disabled={!hasKey}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{cat?.displayName ?? entry.provider}</span>
                  {!hasKey && (
                    <Badge variant="outline" className="border-amber-300 text-amber-700 text-[10px]">
                      未設 key 不能啟用
                    </Badge>
                  )}
                  {usage?.inCooldown && (
                    <Badge variant="outline" className="border-rose-300 text-rose-700 text-[10px]">
                      Cool down
                    </Badge>
                  )}
                </div>
                {usage && (usage.usage.successCount > 0 || usage.usage.errorCount > 0) && (
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    成功 {usage.usage.successCount} · 錯誤 {usage.usage.errorCount} · 切出{" "}
                    {usage.usage.switchOutCount}
                    {usage.usage.lastSuccessAt > 0 && (
                      <> · 最近成功 {formatRelativeTime(usage.usage.lastSuccessAt)}</>
                    )}
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                title="上移"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => move(idx, 1)}
                disabled={idx === draft.chain.length - 1}
                title="下移"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </div>
          );
        })}
      </div>

      <Separator />

      {/* Thresholds */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">切換觸發狀態碼（逗號分隔）</Label>
          <Input
            value={statusInput}
            onChange={(e) => {
              setStatusInput(e.target.value);
              setDirty(true);
            }}
            placeholder="400, 408, 429, 500, 502, 503, 504"
            className="font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            遇到這些 HTTP 狀態碼 → 標記 cool down → 試下一家。Gemini 配額用光實測會回 400 (no body)，故 400 也納入。
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">每日成功請求軟上限（達到主動切下一家）</Label>
          <Input
            value={softLimitInput}
            onChange={(e) => {
              setSoftLimitInput(e.target.value);
              setDirty(true);
            }}
            placeholder="例如：200（留空=不限制）"
            type="number"
            min={0}
            className="font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            適合「Gemini Free Tier RPD 250」這類已知日限。設 200 → 跑到 200 次就主動讓給下一家。
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Cool down 秒數（被切出後多久不再嘗試）</Label>
          <Input
            type="number"
            min={0}
            value={draft.thresholds.cooldownSeconds}
            onChange={(e) => {
              setDraft({
                ...draft,
                thresholds: {
                  ...draft.thresholds,
                  cooldownSeconds: Math.max(0, parseInt(e.target.value || "0", 10)),
                },
              });
              setDirty(true);
            }}
            className="font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            建議 600 秒（10 分鐘）；過短會反覆撞限額、過長會在限額重置後仍跳過該 provider。
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">連續錯誤次數門檻</Label>
          <Input
            type="number"
            min={1}
            value={draft.thresholds.consecutiveErrorThreshold}
            onChange={(e) => {
              setDraft({
                ...draft,
                thresholds: {
                  ...draft.thresholds,
                  consecutiveErrorThreshold: Math.max(1, parseInt(e.target.value || "1", 10)),
                },
              });
              setDirty(true);
            }}
            className="font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            預設 1 → 第一次錯誤就切。設 2 表示同一 provider 連續錯 2 次才切（給暫態錯誤一次重試機會）。
          </p>
        </div>
      </div>

      {dirty && (
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft(config);
              setStatusInput(config.thresholds.switchOnErrorStatuses.join(", "));
              setSoftLimitInput(config.thresholds.dailyRequestSoftLimit?.toString() ?? "");
              setDirty(false);
            }}
            disabled={saving}
          >
            重設
          </Button>
          <Button size="sm" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
            儲存
          </Button>
        </div>
      )}
    </div>
  );
}
