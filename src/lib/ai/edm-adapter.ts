/**
 * 【EDM Generator AI Adapter（瑞士刀整合層）】
 *
 * 把 EDM Generator 內部的 AiAdapter 介面導向瑞士刀自家的 server proxy。
 * 客戶端（瀏覽器）永遠拿不到 OPENAI_API_KEY / GEMINI_API_KEY，所有 AI 呼叫
 * 都走 `/api/tools/edm-generator/ai/text` 與 `/api/tools/edm-generator/ai/image`，
 * 由 server 透過 next-auth session 驗證後才執行。
 *
 * `requiresApiKey: false` 會讓 EDM Generator 的「請先設定 Gemini Key」警示永遠不顯示，
 * 並讓設定面板自動隱藏（與 hostConfig.hideSettingsPanel 配合）。
 */
import type {
  AiAdapter,
  AiGenerateImageOpts,
  AiGenerateImageResult,
  AiGenerateTextOpts,
  AiGenerateTextResult,
} from "@edm/lib/ai/adapter";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const err = (await res.json()) as { error?: string };
      if (err?.error) msg = err.error;
    } catch {
      // ignore JSON parse error；保留 statusText
    }
    throw new Error(`AI 代理失敗：${msg}`);
  }
  return (await res.json()) as T;
}

export const trainerAcademyAiAdapter: AiAdapter = {
  describe() {
    return { name: "培訓師瑞士刀（伺服器代理）", requiresApiKey: false };
  },
  async generateText(opts: AiGenerateTextOpts): Promise<AiGenerateTextResult> {
    return postJson<AiGenerateTextResult>(
      "/api/tools/edm-generator/ai/text",
      opts
    );
  },
  async generateImage(opts: AiGenerateImageOpts): Promise<AiGenerateImageResult> {
    return postJson<AiGenerateImageResult>(
      "/api/tools/edm-generator/ai/image",
      opts
    );
  },
};
