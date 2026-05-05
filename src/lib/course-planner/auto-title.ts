import "server-only";
import {
  createAiClientFor,
  getAiProviderFor,
  getModelFor,
  hasConfiguredApiKeyFor,
  type AiProvider,
} from "@/lib/ai-provider";

/**
 * 課程規劃幫手 — 自動命名（pipeline 開頭呼叫一次）
 *
 * 用很小的 LLM 呼叫（≈300 tokens）依需求文字產生一個 12~22 字的工作標題，
 * 讓 UI 在跑 11 個 Skill 期間就能顯示有意義的名字（而非「（未命名規劃）」）。
 *
 * 設計原則：
 *   - 失敗不影響 pipeline；orchestrator 用 try/catch 吞掉
 *   - 不寫 DB（由呼叫端決定要不要 update title）
 *   - 同樣走 per-feature provider（COURSE_PLANNER_AI_PROVIDER / request.aiProvider）
 */

const SYSTEM_PROMPT = `你是中華電信學院「課程規劃幫手」的命名助理。
任務：依使用者貼上的「培訓需求文字」產生一個簡短工作標題（規劃中的代號，不是最終班名）。

規則：
- 12~22 個中文字
- 像班名／規劃工作標題，不像句子
- 點出主題＋對象（例如「行政同仁 AI 文書效率班」「客服中心情緒管理工作坊」）
- 不可加引號、書名號、副標、標點符號（句末、冒號、逗號都不要）
- 不可帶「規劃」「草案」字樣（介面會自動補）
- 只回標題一行，不要任何前後綴文字、不要編號、不要解釋`;

const MAX_INPUT_CHARS = 4000;

/**
 * 依 rawInputText 產生 12~22 字的工作標題；失敗會 throw。
 */
export async function generateAutoTitle(
  rawInputText: string,
  providerOverride?: AiProvider | null,
): Promise<string> {
  const provider = getAiProviderFor("course_planner", providerOverride ?? null);
  if (!hasConfiguredApiKeyFor(provider)) {
    throw new Error(`auto-title: 未設定 ${provider} API key`);
  }
  const model = getModelFor("course_planner", provider);
  const client = createAiClientFor(provider);

  const text =
    rawInputText.length > MAX_INPUT_CHARS
      ? `${rawInputText.slice(0, MAX_INPUT_CHARS)}\n…（已截斷，僅供命名靈感）`
      : rawInputText;

  const res = await client.chat.completions.create({
    model,
    temperature: 0.4,
    max_tokens: 80,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
  });

  const raw = (res.choices[0]?.message?.content ?? "").trim();
  return cleanTitle(raw);
}

/**
 * 把 LLM 回應清理成乾淨工作標題：
 *  - 取第一行
 *  - 拿掉常見標點符號（中英）
 *  - 拿掉 markdown 強調符號（** _ ` # 等）
 *  - 截斷到 30 字內
 */
function cleanTitle(raw: string): string {
  if (!raw) throw new Error("auto-title: 模型回空");
  const firstLine = raw.split(/\r?\n/)[0]?.trim() ?? "";
  if (!firstLine) throw new Error("auto-title: 無有效首行");
  const cleaned = firstLine
    .replace(/^[\s\-*•·>#0-9.、]+/, "") // 開頭編號 / 強調符
    .replace(/[`*_~"'「」『』《》〈〉""''「」（）()【】[\]：:。．，,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) throw new Error("auto-title: 清理後為空");
  return cleaned.slice(0, 30);
}
