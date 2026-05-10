import "server-only";
import { createAiClientWithKey } from "../ai-provider";
import type { AiProvider } from "../ai-provider-types";

/**
 * 【列模型 Adapter】
 *
 * 對 5 家 OpenAI 相容供應商呼叫 `client.models.list()` 即可拿到模型清單。
 * Gemini 走 OpenAI 相容子端點（/v1beta/openai/models）也支援。
 * 統一回傳格式：去重排序後的 model id 字串陣列 + 額外 metadata（owned_by、context window 若有）。
 */

export interface ListedModel {
  id: string;
  ownedBy: string | null;
  /** OpenRouter 等聚合服務會帶 context length；其他不一定有 */
  contextLength: number | null;
  /** 部分模型會帶，例如 OpenRouter 的 :free 後綴模型 */
  isFree: boolean;
}

export interface ListModelsResult {
  ok: boolean;
  models: ListedModel[];
  /** 如果失敗，這裡有錯誤訊息（給 UI 顯示） */
  error?: string;
  /** HTTP status（若有，幫助 debugging） */
  status?: number;
}

/**
 * 用提供的 key 列模型；專供「設定 UI 測試這把 key 是否有效」用。
 *
 * ⚠️ 注意：
 *   - 不會用到也不該用到 process.env 中已存的 key；管理員此時可能正想驗證新 key 是否有效
 *   - 任何錯誤都被吞，回 ok:false（不拋出，UI 直接看 result.error 顯示紅字）
 */
export async function listModelsForProvider(
  provider: AiProvider,
  apiKey: string
): Promise<ListModelsResult> {
  if (!apiKey || apiKey.trim().length < 8) {
    return { ok: false, models: [], error: "API key 看起來不像有效格式（長度過短）" };
  }

  try {
    const client = createAiClientWithKey(provider, apiKey.trim());
    const resp = await client.models.list();

    const data = (resp as unknown as { data?: unknown[] }).data;
    if (!Array.isArray(data)) {
      return { ok: true, models: [] };
    }

    const models: ListedModel[] = data
      .map((m) => normalizeModel(m))
      .filter((m): m is ListedModel => m !== null);

    // 排序：常用 chat 模型排前面（粗略啟發式：含 instruct/chat/4o/flash/mini/gpt 字樣排前）
    models.sort((a, b) => {
      const sa = chatModelScore(a.id);
      const sb = chatModelScore(b.id);
      if (sa !== sb) return sb - sa;
      return a.id.localeCompare(b.id);
    });

    return { ok: true, models };
  } catch (e) {
    const status = (e as { status?: number }).status;
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      models: [],
      error: msg || "未知錯誤",
      status,
    };
  }
}

function chatModelScore(id: string): number {
  const lower = id.toLowerCase();
  let s = 0;
  if (lower.includes("flash")) s += 6;
  if (lower.includes("4o")) s += 5;
  if (lower.includes("mini")) s += 4;
  if (lower.includes("instruct")) s += 4;
  if (lower.includes("chat")) s += 3;
  if (lower.includes(":free")) s += 5;
  if (lower.includes("70b")) s += 2;
  if (lower.includes("embedding")) s -= 10;
  if (lower.includes("whisper") || lower.includes("tts") || lower.includes("audio")) s -= 8;
  if (lower.includes("dalle") || lower.includes("image")) s -= 8;
  if (lower.includes("vision") && !lower.includes("flash")) s += 1;
  return s;
}

function normalizeModel(raw: unknown): ListedModel | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : null;
  if (!id) return null;
  return {
    id,
    ownedBy: typeof o.owned_by === "string" ? o.owned_by : null,
    contextLength:
      typeof o.context_length === "number"
        ? o.context_length
        : typeof o.context_window === "number"
        ? o.context_window
        : null,
    isFree: id.toLowerCase().includes(":free"),
  };
}
