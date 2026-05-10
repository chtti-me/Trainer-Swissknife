/**
 * AI 供應商目錄（PROVIDER_CATALOG）
 *
 * 集中維護「系統支援的所有 AI 供應商」基本資料：
 *   - 對外顯示名稱、申請 API key 的 URL
 *   - OpenAI 相容 base URL（5 家原生相容、Gemini 走 /v1beta/openai 相容子端點）
 *   - 對應的 Render / .env 環境變數名稱
 *   - 預設 chat / embedding 模型
 *   - free tier 提示文字（給管理員 UI 上看）
 *
 * 設計原則：
 *   - 唯一資料來源（單一 truth）：UI、API、Fallback runtime 都從這裡讀
 *   - 純資料、不引入任何 server-only 依賴；可被 client component 直接 import
 */
import type { AiProvider } from "../ai-provider-types";

export interface ProviderCatalogEntry {
  /** 程式內部識別字（與 AiProvider 對齊） */
  id: AiProvider;
  /** 顯示名稱（UI 用） */
  displayName: string;
  /** 簡短一句話描述（UI 副標題） */
  shortDescription: string;
  /** OpenAI 相容 chat completions base URL（給 SDK new OpenAI({ baseURL }) 用） */
  defaultBaseUrl: string;
  /**
   * 列模型用的「自訂 path」。
   * - 多數 OpenAI 相容供應商可直接用 SDK 的 `client.models.list()`，不需自訂 path
   * - Gemini 例外：OpenAI 相容子端點是 /v1beta/openai/models，SDK 走預設可正常用
   * - 若 SDK 無法直接列，預留 fallbackListModelsUrl 給手動 fetch 用
   */
  fallbackListModelsUrl?: string;
  /** 申請 / 管理 API key 的官方 URL（UI 顯示「前往申請」連結） */
  apiKeyConsoleUrl: string;
  /** 對應的環境變數名稱（管理員要在 Render 設這些） */
  envVars: {
    apiKey: string;
    baseUrl: string;
    chatModel: string;
    /** 規劃幫手專用模型（與一般 chat model 可能不同） */
    planningModel?: string;
    /** Embedding 模型（不是每家都有） */
    embeddingModel?: string;
  };
  /** 預設 chat 模型（管理員若不指定，系統用這個） */
  defaultChatModel: string;
  /** 規劃幫手預設模型（若同 chat 模型可空） */
  defaultPlanningModel?: string;
  /** 預設 embedding 模型（無則此 provider 不支援 embedding） */
  defaultEmbeddingModel?: string;
  /**
   * Free tier 描述（UI 顯示「免費額度」提示用）。
   * 注意：API 限制隨時可能調整，這裡只是「給管理員心理準備」的非官方備忘。
   */
  freeTierNote?: string;
  /**
   * 地理限制警語（UI 顯示醒目 banner）。目前僅 Google Gemini 有此問題：
   * 免費 API key 對發起請求的 IP 做 geo check，台灣 / Render SG 常踩雷。
   */
  geoRestrictionWarning?: string;
  /** 主要顏色（UI 卡片用，tailwind 色系字串） */
  brandColor: string;
  /** 是否預設啟用（render.yaml 已內建欄位） */
  enabledByDefault: boolean;
}

/**
 * 6 家供應商完整目錄。
 *
 * 排列順序（v2 後調整）：
 *   OpenRouter → Groq → Gemini → NVIDIA → OpenAI → xAI
 *
 * 為什麼 Gemini 從第 1 降到第 3：
 *   Google Gemini 免費版（AI Studio key）對發起 IP 有「User location」地理檢查，
 *   台灣家用 IP / Render Singapore 出口 IP 都常踩到 `400 User location is not supported
 *   for the API use.`，造成 demo 場景失靈。OpenRouter 自家 server 在 US、無此檢查，
 *   且也提供 Gemini Flash:free 模型轉發；Groq 同樣無地理限制且速度極快。
 *   故將前兩個預設啟用名額讓給更穩定的 OpenRouter / Groq。
 */
export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: "openrouter",
    displayName: "OpenRouter",
    shortDescription:
      "AI 模型聚合服務，一把 key 可呼叫 100+ 模型；提供多支 free 模型（含 Llama、Mistral、Gemini Flash 等）。Server 在 US，無地理限制。",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    apiKeyConsoleUrl: "https://openrouter.ai/keys",
    envVars: {
      apiKey: "OPENROUTER_API_KEY",
      baseUrl: "OPENROUTER_BASE_URL",
      chatModel: "OPENROUTER_MODEL",
      planningModel: "OPENROUTER_MODEL_PLANNING",
    },
    // OpenRouter 內建多款 free 模型；預設挑一個穩定且 context 大的免費模型
    defaultChatModel: "meta-llama/llama-3.3-70b-instruct:free",
    defaultPlanningModel: "meta-llama/llama-3.3-70b-instruct:free",
    freeTierNote:
      "Free tier：模型名稱結尾帶 `:free` 的免費，每日約 50 次 / 模型；綁信用卡可解鎖更高頻次與付費模型。",
    brandColor: "purple",
    enabledByDefault: true,
  },
  {
    id: "groq",
    displayName: "Groq Cloud",
    shortDescription:
      "LPU 推論硬體，速度極快（typical 500+ tokens/s）；提供 Llama 3.3 70B、Mixtral、Gemma 等開源模型。無地理限制。",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    apiKeyConsoleUrl: "https://console.groq.com/keys",
    envVars: {
      apiKey: "GROQ_API_KEY",
      baseUrl: "GROQ_BASE_URL",
      chatModel: "GROQ_MODEL",
      planningModel: "GROQ_MODEL_PLANNING",
    },
    defaultChatModel: "llama-3.3-70b-versatile",
    defaultPlanningModel: "llama-3.3-70b-versatile",
    freeTierNote:
      "Free tier：依模型不同 RPM 30~60、RPD 7000~14000；速度很快但會有「同帳號全模型共享 token quota」的限制。",
    brandColor: "orange",
    enabledByDefault: true,
  },
  {
    id: "gemini",
    displayName: "Google Gemini",
    shortDescription:
      "Google AI Studio 的 Gemini 系列，OpenAI 相容子端點。免費額度足以個人 / 小團隊每日試用。",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKeyConsoleUrl: "https://aistudio.google.com/app/apikey",
    envVars: {
      apiKey: "GEMINI_API_KEY",
      baseUrl: "GEMINI_BASE_URL",
      chatModel: "GEMINI_MODEL",
      planningModel: "GEMINI_MODEL_PLANNING",
      embeddingModel: "GEMINI_EMBEDDING_MODEL",
    },
    defaultChatModel: "gemini-2.5-flash",
    defaultPlanningModel: "gemini-2.5-flash",
    defaultEmbeddingModel: "gemini-embedding-001",
    freeTierNote:
      "Free tier：gemini-2.5-flash 約 RPM 10、RPD 250、TPM 250k；用完當日（UTC 0:00）才重置。實測「400 status code (no body)」最常見的成因就是 RPD 用光。",
    geoRestrictionWarning:
      "⚠️ 免費 API key 有地理限制：對發起請求的 server IP 做 location 檢查，台灣家用 IP / Render Singapore region 都常踩到 `User location is not supported`，建議改用 OpenRouter（也能用 Gemini 模型且無地理限制）。",
    brandColor: "blue",
    enabledByDefault: false,
  },
  {
    id: "nvidia",
    displayName: "NVIDIA NIM",
    shortDescription:
      "build.nvidia.com 提供的官方推論服務，模型涵蓋 Llama、Mistral、Nemotron 等；新帳號送一定免費額度。",
    defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
    apiKeyConsoleUrl: "https://build.nvidia.com/settings/api-keys",
    envVars: {
      apiKey: "NVIDIA_API_KEY",
      baseUrl: "NVIDIA_BASE_URL",
      chatModel: "NVIDIA_MODEL",
      planningModel: "NVIDIA_MODEL_PLANNING",
    },
    defaultChatModel: "meta/llama-3.3-70b-instruct",
    defaultPlanningModel: "meta/llama-3.3-70b-instruct",
    freeTierNote:
      "Free tier：個人帳號註冊送 1000 credits，每次呼叫消耗依模型計算；可用作備援但不適合主要流量。",
    brandColor: "green",
    enabledByDefault: false,
  },
  {
    id: "openai",
    displayName: "OpenAI",
    shortDescription:
      "原廠 OpenAI（GPT-4o、GPT-5 系列、o1 推理模型）。穩定度與功能完整度最高，但全部按用量計費、無永久免費。",
    defaultBaseUrl: "https://api.openai.com/v1",
    apiKeyConsoleUrl: "https://platform.openai.com/api-keys",
    envVars: {
      apiKey: "OPENAI_API_KEY",
      baseUrl: "OPENAI_BASE_URL",
      chatModel: "OPENAI_MODEL",
      planningModel: "OPENAI_MODEL_PLANNING",
      embeddingModel: "OPENAI_EMBEDDING_MODEL",
    },
    defaultChatModel: "gpt-4o-mini",
    defaultPlanningModel: "gpt-4o-mini",
    defaultEmbeddingModel: "text-embedding-3-small",
    freeTierNote:
      "無永久免費；新帳號 3 個月內贈 $5 免費額度。Tier 1 起 RPM/TPM 隨累計付費自動提升。",
    brandColor: "slate",
    enabledByDefault: false,
  },
  {
    id: "xai",
    displayName: "xAI Grok",
    shortDescription:
      "Elon Musk 的 xAI 推出的 Grok 系列（grok-2、grok-2-mini）；強項在即時資訊與長 context。",
    defaultBaseUrl: "https://api.x.ai/v1",
    apiKeyConsoleUrl: "https://console.x.ai/",
    envVars: {
      apiKey: "XAI_API_KEY",
      baseUrl: "XAI_BASE_URL",
      chatModel: "XAI_MODEL",
      planningModel: "XAI_MODEL_PLANNING",
    },
    defaultChatModel: "grok-2-latest",
    defaultPlanningModel: "grok-2-latest",
    freeTierNote:
      "新帳號可申請評估額度（額度需到 console 申請）；正式使用按 token 計費。",
    brandColor: "zinc",
    enabledByDefault: false,
  },
];

/**
 * 依 provider id 取得 catalog 條目；找不到回 null（呼叫端應 fallback）
 */
export function getProviderCatalog(id: string): ProviderCatalogEntry | null {
  return PROVIDER_CATALOG.find((p) => p.id === id) ?? null;
}

/**
 * 列出所有支援的 provider id（給型別 narrowing 與下拉選單用）
 */
export function listProviderIds(): AiProvider[] {
  return PROVIDER_CATALOG.map((p) => p.id);
}
