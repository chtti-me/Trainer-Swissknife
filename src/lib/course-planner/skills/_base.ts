import "server-only";
import { createHash } from "node:crypto";
import { ZodError, type z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createAiClientFor,
  getAiProviderFor,
  getModelFor,
  hasConfiguredApiKeyFor,
  type AiProvider,
} from "@/lib/ai-provider";
import { loadCachedSkillContext, PLANNING_INCLUDED_GLOBAL_SLUGS, PLANNING_INCLUDED_SLUG_PREFIXES } from "@/lib/ai-skills";
import {
  buildSystemPrompt,
  JSON_OUTPUT_INSTRUCTION,
  REASONING_INSTRUCTION,
  ROLE_PREAMBLE,
} from "../prompts/shared";
import type { LlmSkillName } from "../schemas/common";
import { describeZodSchema } from "./schema-describe";

/**
 * Skill 定義介面：每個 LLM Skill 必須提供以下欄位。
 * 命名與職責和 v2 CourseCraft 的 AgentDef 相似但更精簡：
 *   - 不綁 Vercel AI SDK
 *   - 不寫 DB（DB 由 runSkill() 處理）
 *   - 不做 reasoning 預設值（schema 自己定）
 */
/**
 * Skill 定義介面：每個 LLM Skill 必須提供以下欄位。
 *
 * 註：ZodType 用三個泛型 `<Output, Def, Input>`，第三個 Input 設為 `any` 以便相容
 * 含預設值欄位（如 `assumptions: z.array(...).default([])`）的 schema——此時
 * 輸入端可省略該欄位，但輸出端為已填值的 string[]。
 */
export interface SkillDef<TIn, TOut> {
  name: LlmSkillName;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: z.ZodType<TIn, z.ZodTypeDef, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  outputSchema: z.ZodType<TOut, z.ZodTypeDef, any>;
  /** Skill 專屬 system prompt（會與 ROLE_PREAMBLE / REASONING_INSTRUCTION / JSON_OUTPUT_INSTRUCTION 串接） */
  systemPrompt: string;
  /** 把 input 序列化成 user message */
  buildUserMessage: (input: TIn) => string;
  /** OpenAI 0~1（不傳則預設 0.3 分析型 / 0.5 生成型） */
  temperature?: number;
}

export interface RunSkillOptions {
  requestId: string;
  /** 強制使用某個 sequence；不傳則自動 +1 */
  sequence?: number;
  /** 注入到 prompt 的 user 端 AI 技能脈絡（buildAiSkillPromptAppend 結果） */
  skillContextAppend?: string;
  /**
   * 強制重跑：true 時忽略 input-hash cache，一定打 LLM。
   * 預設 false：若同 (requestId, skillName) 最近一筆成功的 run 其 input hash 與本次相同，直接讀回上次結果不打 LLM。
   */
  forceRerun?: boolean;
  /**
   * AI 供應商指定（從 CoursePlanRequest.aiProvider 帶下來）。
   * 若不傳，走 `getAiProviderFor("course_planner")` → 功能 env → 全站 env。
   */
  provider?: AiProvider | null;
  /**
   * 模型指定（覆寫 env 預設）。一般情況不需傳，由 provider + COURSE_PLANNER_AI_MODEL 自行決定。
   */
  model?: string | null;
}

export interface RunSkillResult<TOut> {
  output: TOut;
  runId: string;
  durationMs: number;
  reasoning: string;
  /** 此次是否走 input-hash cache（沒打 LLM、沒新建 SkillRun row） */
  cached?: boolean;
  /** 此次是否在重試過程中遇過 429（讓 orchestrator 動態加大 Skill 間隔） */
  hit429?: boolean;
}

/**
 * 解析「本次 runSkill 用哪家 + 什麼模型」。
 *
 * 優先序：
 *   1. options.provider（呼叫端指定，例如 orchestrator 從 CoursePlanRequest.aiProvider 帶下來）
 *   2. COURSE_PLANNER_AI_PROVIDER env
 *   3. AI_PROVIDER env（全站預設）
 */
function resolveProviderAndModel(options: RunSkillOptions): { provider: AiProvider; model: string } {
  const provider = getAiProviderFor("course_planner", options.provider);
  const model = options.model?.trim() || getModelFor("course_planner", provider);
  return { provider, model };
}

async function nextSequence(requestId: string, skillName: LlmSkillName): Promise<number> {
  const last = await prisma.coursePlanSkillRun.findFirst({
    where: { requestId, skillName },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  return (last?.sequence ?? 0) + 1;
}

/**
 * 穩定 JSON stringify：把物件鍵排序後序列化，讓相同內容產出一致字串。
 * 用來計算 input hash，避免因為 key 順序不同而誤判為「input 變了」。
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts = keys
    .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
  return `{${parts.join(",")}}`;
}

function hashInput(input: unknown): string {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

/**
 * 找最近一筆相同 input 的 success run。
 * 因 CoursePlanSkillRun 沒有 inputHash 欄位，這邊掃最新幾筆 hash 比對（多半第一筆就會中）。
 */
async function findCachedRun(
  requestId: string,
  skillName: LlmSkillName,
  inputHash: string,
): Promise<{ id: string; output: unknown; reasoning: string | null; durationMs: number | null } | null> {
  const candidates = await prisma.coursePlanSkillRun.findMany({
    where: { requestId, skillName, status: "success" },
    orderBy: { sequence: "desc" },
    take: 5,
    select: { id: true, input: true, output: true, reasoning: true, durationMs: true },
  });
  for (const c of candidates) {
    if (hashInput(c.input) === inputHash) {
      return { id: c.id, output: c.output, reasoning: c.reasoning, durationMs: c.durationMs };
    }
  }
  return null;
}

/**
 * 提供給前端 / route：檢查同樣 input 是否已有快取，但不真的執行 Skill。
 * 用於「重跑前先確認」的 UX。
 */
export async function checkInputCache(
  requestId: string,
  skillName: LlmSkillName,
  rawInput: unknown,
): Promise<{ canSkip: boolean; lastRunId: string | null; lastDurationMs: number | null }> {
  const inputHash = hashInput(rawInput);
  const cached = await findCachedRun(requestId, skillName, inputHash);
  return {
    canSkip: cached !== null,
    lastRunId: cached?.id ?? null,
    lastDurationMs: cached?.durationMs ?? null,
  };
}

function tryParseJson(content: string): unknown {
  // 1) 直接 parse
  try {
    return JSON.parse(content);
  } catch {
    /* fall-through */
  }
  // 2) 抓 ```json ... ``` 區塊
  const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* fall-through */
    }
  }
  // 3) 抓第一個 { ... } 或 [ ... ]
  const objMatch = content.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch {
      /* fall-through */
    }
  }
  throw new Error("LLM 回應無法解析為 JSON");
}

/**
 * 呼叫 LLM 跑一次 Skill。流程：
 *   1. 從 inputSchema 驗 input
 *   2. 在 DB 寫 SkillRun（status=running）
 *   3. 組 system / user prompt（含 AI 技能脈絡）
 *   4. 呼 OpenAI-compat API（OpenAI 用 response_format=json_object，Gemini 不用）
 *   5. 解析 JSON、用 outputSchema 驗
 *   6. 失敗自動重試一次（把錯訊息塞回 prompt 請 LLM 修正）
 *   7. 寫回 SkillRun（status=success/failed）
 */
export async function runSkill<TIn, TOut extends { reasoning: string }>(
  skill: SkillDef<TIn, TOut>,
  rawInput: unknown,
  options: RunSkillOptions,
): Promise<RunSkillResult<TOut>> {
  const startedAt = Date.now();

  const input = skill.inputSchema.parse(rawInput);

  // ============================================================
  // P0：input-hash cache。同一 (requestId, skillName) 上次成功 run 的 input 與本次完全相同 → 直接讀回。
  // ============================================================
  if (!options.forceRerun) {
    const inputHash = hashInput(input);
    const cached = await findCachedRun(options.requestId, skill.name, inputHash);
    if (cached) {
      const validated = skill.outputSchema.parse(cached.output);
      return {
        output: validated,
        runId: cached.id,
        durationMs: cached.durationMs ?? 0,
        reasoning: validated.reasoning,
        cached: true,
      };
    }
  }

  const { provider, model } = resolveProviderAndModel(options);

  const sequence = options.sequence ?? (await nextSequence(options.requestId, skill.name));
  const run = await prisma.coursePlanSkillRun.create({
    data: {
      requestId: options.requestId,
      skillName: skill.name,
      sequence,
      input: input as Prisma.InputJsonValue,
      status: "running",
      model,
    },
    select: { id: true },
  });

  let hit429 = false;

  try {
    if (!hasConfiguredApiKeyFor(provider)) {
      const envName =
        provider === "openai" ? "OPENAI_API_KEY" : provider === "gemini" ? "GEMINI_API_KEY" : "GROQ_API_KEY";
      throw new Error(`尚未設定 ${envName}，無法以 ${provider} 執行 ${skill.name} Skill。`);
    }

    const systemPrompt = buildSystemPrompt(
      ROLE_PREAMBLE,
      skill.systemPrompt,
      REASONING_INSTRUCTION,
      JSON_OUTPUT_INSTRUCTION,
    );

    // 把 outputSchema 轉成人類可讀的介面文字塞進 prompt，大幅降低 LLM 漏寫欄位的機率。
    const schemaDescription = describeZodSchema(skill.outputSchema as unknown as z.ZodTypeAny);
    const schemaSection = `\n\n## 你必須輸出符合以下 schema 的 JSON（含註解標示意圖；不要照抄註解、要產出實際內容）：\n\`\`\`ts\n${schemaDescription}\n\`\`\`\n所有沒標 ? 的欄位都是必填，**不能省略**；標記「至少 N 個元素」的陣列必須真的給足。`;

    const baseUserMessage = skill.buildUserMessage(input) + schemaSection;
    const userMessage = options.skillContextAppend?.trim()
      ? `${baseUserMessage}\n\n${options.skillContextAppend}`
      : baseUserMessage;

    const client = createAiClientFor(provider);
    const temperature = skill.temperature ?? 0.4;

    const callOnce = async (extraNote?: string) => {
      const finalUser = extraNote
        ? `${userMessage}\n\n[修正提示] ${extraNote}\n請只回 JSON、不要其他文字、不要省略任何 schema 上的必填欄位。`
        : userMessage;
      // 三家都吃 response_format: json_object（OpenAI 原生、Gemini OpenAI-compat、Groq OpenAI-compat 皆支援）
      const response = await client.chat.completions.create({
        model,
        temperature,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: finalUser },
        ],
      });
      return response.choices[0]?.message?.content || "{}";
    };

    /** 偵測 OpenAI / Gemini 各種 429 / quota 變體訊息 */
    const is429 = (err: unknown): boolean => {
      if (!err) return false;
      const e = err as { status?: number; statusCode?: number; code?: string; message?: string };
      if (e.status === 429 || e.statusCode === 429) return true;
      const msg = String(e.message ?? err);
      return /\b429\b|rate[_ -]?limit|quota|exceeded|RESOURCE_EXHAUSTED|too many requests/i.test(msg);
    };

    /** 把 429 包成友善訊息（讓培訓師理解這是 quota 用完，不是程式 bug） */
    const friendly429 = (originalErr: unknown): Error => {
      const original = originalErr instanceof Error ? originalErr.message : String(originalErr);
      const providerLabel =
        provider === "openai" ? "OpenAI" : provider === "gemini" ? "Gemini" : "Groq";
      const dailyHint =
        provider === "gemini"
          ? "\nGemini Free Tier 每日上限約 250 次請求／模型，跑滿一次完整 11 Skill 規劃約用 11~25 次（含重試）。"
          : provider === "groq"
            ? "\nGroq Free Tier 上限因模型而異：llama-3.3-70b-versatile ≈ 30 RPM / 12K TPM / 1000 RPD；openai/gpt-oss-120b ≈ 30 RPM / 8K TPM / 1000 RPD。詳見 https://console.groq.com/docs/rate-limits。"
            : "";
      const switchHint =
        provider === "gemini"
          ? "改用 Groq（先在 .env 補上 GROQ_API_KEY，課程規劃幫手頁面右上「執行引擎」切到 Groq；或設 COURSE_PLANNER_AI_PROVIDER=groq）"
          : provider === "groq"
            ? "改用 Gemini（在課程規劃幫手頁面右上「執行引擎」切到 Gemini）"
            : "改用 Gemini 或 Groq（在課程規劃幫手頁面右上「執行引擎」切換）";
      return new Error(
        `${providerLabel} API 額度已用完（429 Too Many Requests，已自動退避 5 次仍失敗）。${dailyHint}\n` +
          `處理方式（擇一）：\n` +
          `1. 等待配額重置：每分鐘配額幾分鐘後恢復；每日配額隔日 0 時（太平洋時間）重置\n` +
          `2. ${switchHint}\n` +
          `3. 提高 Skill 間隔：把 .env 的 COURSE_PLANNER_SKILL_DELAY_MS 設大（目前預設 4500ms）\n` +
          `（原始錯誤：${original.slice(0, 200)}）`,
      );
    };

    /** 指數退避重試（針對 429）。一般驗證錯則只重試 1 次（把錯訊息送回給 LLM 修正）。 */
    const callWithRetry = async (extraNote?: string): Promise<string> => {
      const maxAttempts = 5;
      const backoffMs = [3000, 8000, 15000, 30000, 60000];
      let lastErr: unknown;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          return await callOnce(extraNote);
        } catch (err) {
          lastErr = err;
          if (is429(err)) hit429 = true;
          if (!is429(err) || attempt === maxAttempts - 1) {
            if (is429(err)) throw friendly429(err);
            throw err;
          }
          const wait = backoffMs[attempt] ?? 60000;
          console.warn(
            `[course-planner ${skill.name}] 429 rate-limit，第 ${attempt + 1} 次退避 ${wait}ms 後重試`,
          );
          await new Promise((r) => setTimeout(r, wait));
        }
      }
      throw lastErr;
    };

    /**
     * 把 ZodError 轉成「給 LLM 的對症修正提示」：
     *   - 條列每個錯欄位的 path / 期望型別 / 訊息
     *   - 附上 LLM 上次產出的（破損）JSON，請它「在保留其他正確欄位前提下」修正
     * Llama-3.3-70b（Groq）在 best-effort JSON 模式下偶爾會漏 schema 欄位，
     * 把上次 JSON 回填給它效果遠比只丟錯誤訊息好。
     */
    const buildCorrectionNote = (err: unknown, previousParsed: unknown, attemptIndex: number): string => {
      const headerMap = ["上次", "上上次", "前一次"];
      const header = headerMap[attemptIndex] ?? "上次";
      if (err instanceof ZodError) {
        const issues = err.errors
          .slice(0, 20)
          .map((e) => {
            const path = e.path.length ? e.path.join(".") : "(根物件)";
            const expected = "expected" in e ? `，expected=${(e as { expected?: string }).expected}` : "";
            return `- ${path}：${e.message}（code=${e.code}${expected}）`;
          })
          .join("\n");
        let prevJsonStr = "(無法序列化)";
        try {
          prevJsonStr = JSON.stringify(previousParsed, null, 2).slice(0, 3500);
        } catch {
          /* ignore */
        }
        return (
          `${header} JSON 有以下欄位錯誤，請在「保留所有原本正確欄位、不要刪減內容」的前提下，` +
          `針對下列欄位逐一補/改後輸出完整 JSON（不可省略其他欄位、不可只輸出 diff）：\n` +
          `${issues}\n\n` +
          `## ${header}的 JSON（請以此為基礎修正）\n${prevJsonStr}`
        );
      }
      const reason = err instanceof Error ? err.message : String(err);
      return `${header}回應驗證失敗：${reason.slice(0, 400)}`;
    };

    let parsed: unknown;
    let validated!: TOut;
    let lastValidationErr: unknown = null;
    let parseAttemptOk = false;

    // 第一次：不帶修正提示
    try {
      const content = await callWithRetry();
      parsed = tryParseJson(content);
      validated = skill.outputSchema.parse(parsed);
      parseAttemptOk = true;
    } catch (firstErr) {
      if (firstErr instanceof Error && firstErr.message.includes("API 額度已用完")) throw firstErr;
      if (is429(firstErr)) throw friendly429(firstErr);
      lastValidationErr = firstErr;
    }

    // 後續最多 2 次驗證重試（總共最多 3 次 LLM 呼叫）。每次都把上次的（破損）JSON 帶回去給 LLM 修正。
    const MAX_VALIDATION_RETRIES = 2;
    for (let attempt = 0; !parseAttemptOk && attempt < MAX_VALIDATION_RETRIES; attempt++) {
      const correctionNote = buildCorrectionNote(lastValidationErr, parsed, attempt);
      try {
        const contentRetry = await callWithRetry(correctionNote);
        const retryParsed = tryParseJson(contentRetry);
        const retryValidated = skill.outputSchema.parse(retryParsed);
        parsed = retryParsed;
        validated = retryValidated;
        parseAttemptOk = true;
        if (attempt > 0) {
          console.warn(`[course-planner ${skill.name}] schema 驗證在第 ${attempt + 2} 次嘗試成功`);
        }
      } catch (retryErr) {
        if (retryErr instanceof Error && retryErr.message.includes("API 額度已用完")) throw retryErr;
        if (is429(retryErr)) throw friendly429(retryErr);
        lastValidationErr = retryErr;
      }
    }

    if (!parseAttemptOk) {
      throw lastValidationErr ?? new Error(`${skill.name} schema 驗證重試 ${MAX_VALIDATION_RETRIES + 1} 次仍失敗`);
    }

    const durationMs = Date.now() - startedAt;
    await prisma.coursePlanSkillRun.update({
      where: { id: run.id },
      data: {
        output: validated as Prisma.InputJsonValue,
        reasoning: validated.reasoning,
        status: "success",
        durationMs,
      },
    });

    return { output: validated, runId: run.id, durationMs, reasoning: validated.reasoning, hit429 };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    await prisma.coursePlanSkillRun.update({
      where: { id: run.id },
      data: { status: "failed", error: message, durationMs },
    });
    throw err;
  }
}

/**
 * 取得目前登入使用者的 AI 技能脈絡 append 字串（每個 Skill 跑前呼叫一次）。
 * 與 v1 generate route 相同 slug 篩選；走 in-memory cache（TTL 5 分鐘）避免單次 pipeline 內 11 次重打 DB。
 */
export async function loadSkillContext(userId: string): Promise<string> {
  return loadCachedSkillContext(userId, {
    includeSlugs: [...PLANNING_INCLUDED_GLOBAL_SLUGS],
    includeSlugPrefixes: [...PLANNING_INCLUDED_SLUG_PREFIXES],
  });
}
