/**
 * 課程規劃幫手 — Pipeline Orchestrator
 *
 * 串起既有班搜尋 + 11 個 Skill，以 async generator 形式 yield SSE 事件。
 * API route 會用這個 generator + 把事件包成 SSE 推給前端。
 */
import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AiProvider } from "@/lib/ai-provider";
import { findSimilarExistingClasses, REUSE_THRESHOLD } from "./existing-class-lookup";
import { lookupAllSources } from "./instructor-lookup";
import { runSkill, loadSkillContext } from "./skills/_base";
import { pruneCandidatesPerSession } from "./output-pruner";
import { generateAutoTitle } from "./auto-title";
import {
  needsSkill,
  audienceSkill,
  objectivesSkill,
  outlineSkill,
  formatSkill,
  instructorSkill,
  scheduleSkill,
  promoSkill,
  notificationSkill,
  materialsSkill,
  assessmentSkill,
} from "./skills";
import { SKILL_PIPELINE_ORDER, SKILL_DISPLAY_NAMES, type LlmSkillName, type SkillName } from "./schemas/common";
import {
  buildAuxiliaryDocs,
  buildCoursePlanForm,
  type AllSkillOutputs,
} from "./form-mapper";
import type { Candidate } from "./schemas/instructor";

export type OrchestratorEvent =
  | { type: "request_started"; requestId: string }
  | { type: "title_updated"; title: string }
  | {
      type: "existing_lookup_complete";
      topScore: number;
      reuseRecommended: boolean;
      hasReferences: boolean;
      matches: Array<{
        classId: string;
        className: string;
        classCode: string | null;
        category: string | null;
        score: number;
      }>;
    }
  | { type: "skill_start"; skill: SkillName; displayName: string }
  | {
      type: "skill_complete";
      skill: SkillName;
      displayName: string;
      output: unknown;
      reasoning: string;
      durationMs: number;
      /** 是否走 input-hash cache（沒打 LLM） */
      cached?: boolean;
      /** 此次跑該 Skill 是否在重試中遇過 429 */
      hit429?: boolean;
    }
  | {
      type: "skill_failed";
      skill: SkillName;
      displayName: string;
      error: string;
    }
  | {
      type: "complete";
      form: ReturnType<typeof buildCoursePlanForm>;
      auxDocs: ReturnType<typeof buildAuxiliaryDocs>;
    }
  | { type: "error"; message: string };

export interface RunOptions {
  /** 是否跳過既有班搜尋（重跑單一 skill 時不需重做） */
  skipExistingLookup?: boolean;
  /** 偏好總時數（給 outline Skill） */
  preferredTotalHours?: number;
  /** 偏好天數（給 schedule Skill） */
  preferredDays?: number;
  /** 從哪個 Skill 開始（重跑用）；預設從第一個 */
  startFromSkill?: LlmSkillName;
  /** 已有的 outputs（重跑時下游 Skill 沿用上游既有結果） */
  existingOutputs?: Partial<AllSkillOutputs>;
  /** 強制每個 Skill 重跑（忽略 input-hash cache） */
  forceRerun?: boolean;
  /**
   * AI 供應商覆寫（會傳到每個 runSkill）。
   * 若不傳則由 runSkill 走 `getAiProviderFor("course_planner")` → COURSE_PLANNER_AI_PROVIDER → AI_PROVIDER。
   * 一般是從 `CoursePlanRequest.aiProvider` 帶下來。
   */
  provider?: AiProvider | null;
}

export async function* runPipeline(
  requestId: string,
  options: RunOptions = {},
): AsyncGenerator<OrchestratorEvent, void, unknown> {
  yield { type: "request_started", requestId };

  const request = await prisma.coursePlanRequest.findUnique({
    where: { id: requestId },
    select: { id: true, createdBy: true, rawInputText: true, aiProvider: true, title: true },
  });
  if (!request) {
    yield { type: "error", message: `找不到 request ${requestId}` };
    return;
  }
  const userId = request.createdBy;
  // 解析本次 pipeline 用的 AI 供應商：呼叫端傳 > request DB 欄位 > runSkill 內部 fallback
  const providerOverride: AiProvider | null = (options.provider ?? (request.aiProvider as AiProvider | null)) || null;

  await prisma.coursePlanRequest.update({
    where: { id: requestId },
    data: { status: "running", currentSkill: "existing_lookup" },
  });

  // ============================================================
  // 前置 0：自動命名（若使用者沒填 title）
  // 一個輕量 LLM 呼叫（~300 tokens）讓畫面在跑 11 個 Skill 時就有像樣的標題。
  // 失敗不影響 pipeline；只 console.warn。
  // 只在「全新 pipeline」（沒有 startFromSkill）時做；單一 Skill 重跑不必再命名。
  // ============================================================
  if (!options.startFromSkill && (!request.title || request.title.trim() === "")) {
    try {
      const autoTitle = await generateAutoTitle(request.rawInputText, providerOverride);
      await prisma.coursePlanRequest.update({
        where: { id: requestId },
        data: { title: autoTitle },
      });
      yield { type: "title_updated", title: autoTitle };
    } catch (err) {
      console.warn(
        "[course-planner orchestrator] auto-title 失敗（不影響 pipeline）：",
        (err as Error).message,
      );
    }
  }

  // ============================================================
  // 前置：既有班相似度搜尋
  // ============================================================
  let similarClasses: Array<{ className: string; category: string | null; score: number }> = [];

  if (!options.skipExistingLookup) {
    try {
      const lookup = await findSimilarExistingClasses(request.rawInputText, { topK: 5 });
      similarClasses = lookup.matches.map((m) => ({
        className: m.className,
        category: m.category,
        score: m.totalScore,
      }));
      yield {
        type: "existing_lookup_complete",
        topScore: lookup.topScore,
        reuseRecommended: lookup.reuseRecommended,
        hasReferences: lookup.hasReferences,
        matches: lookup.matches.map((m) => ({
          classId: m.classId,
          className: m.className,
          classCode: m.classCode,
          category: m.category,
          score: m.totalScore,
        })),
      };
    } catch (e) {
      console.warn("[course-planner orchestrator] 既有班搜尋失敗：", (e as Error).message);
    }
  }

  // 載入 AI 技能脈絡（只載一次，跨所有 Skill 共用）
  const skillContextAppend = await loadSkillContext(userId);

  // 重跑時用既有 outputs 作為起點
  const outputs: Partial<AllSkillOutputs> = { ...(options.existingOutputs ?? {}) };

  // 計算實際要跑的 Skill 子集（從 startFromSkill 開始）
  let pipelineToRun: LlmSkillName[] = [...SKILL_PIPELINE_ORDER];
  if (options.startFromSkill) {
    const idx = SKILL_PIPELINE_ORDER.indexOf(options.startFromSkill);
    if (idx >= 0) pipelineToRun = SKILL_PIPELINE_ORDER.slice(idx);
  }

  // Skill 間最少間隔（避免 Gemini free tier 15 RPM 快速燒爆 429）。
  // 4500ms ≈ 13 RPM，留 2 RPM buffer 給 instructor 跑 web search、retry 等。
  // 可由 env 微調（例如付費版可設為 0）。
  const baseDelayMs = Number(process.env.COURSE_PLANNER_SKILL_DELAY_MS ?? "4500");
  const maxDelayMs = Number(process.env.COURSE_PLANNER_SKILL_DELAY_MAX_MS ?? "30000");
  let currentDelayMs = baseDelayMs;
  let consecutive429 = 0; // 連續遇到 429 的 Skill 數量
  let isFirstSkill = true;
  // 共用 runSkill 選項
  const sharedRunOpts = {
    requestId,
    skillContextAppend,
    forceRerun: options.forceRerun,
    provider: providerOverride,
  };

  for (const skillName of pipelineToRun) {
    if (!isFirstSkill && currentDelayMs > 0) {
      await new Promise((r) => setTimeout(r, currentDelayMs));
    }
    isFirstSkill = false;
    const display = SKILL_DISPLAY_NAMES[skillName];
    yield { type: "skill_start", skill: skillName, displayName: display };
    await prisma.coursePlanRequest.update({
      where: { id: requestId },
      data: { currentSkill: skillName },
    });

    let lastResult: { cached?: boolean; hit429?: boolean } | null = null;

    try {
      switch (skillName) {
        case "needs": {
          const result = await runSkill(needsSkill, {
            rawInputText: request.rawInputText,
            similarExistingClasses: similarClasses,
          }, sharedRunOpts);
          outputs.needs = result.output;
          lastResult = result;
          yield {
            type: "skill_complete", skill: skillName, displayName: display,
            output: result.output, reasoning: result.reasoning, durationMs: result.durationMs,
            cached: result.cached, hit429: result.hit429,
          };
          break;
        }
        case "audience": {
          if (!outputs.needs) throw new Error("audience 需要 needs 上游");
          const result = await runSkill(audienceSkill, {
            needs: outputs.needs,
          }, sharedRunOpts);
          outputs.audience = result.output;
          lastResult = result;
          yield {
            type: "skill_complete", skill: skillName, displayName: display,
            output: result.output, reasoning: result.reasoning, durationMs: result.durationMs,
            cached: result.cached, hit429: result.hit429,
          };
          break;
        }
        case "objectives": {
          if (!outputs.needs || !outputs.audience) throw new Error("objectives 需要 needs/audience 上游");
          const result = await runSkill(objectivesSkill, {
            needs: outputs.needs,
            audience: outputs.audience,
          }, sharedRunOpts);
          outputs.objectives = result.output;
          lastResult = result;
          yield {
            type: "skill_complete", skill: skillName, displayName: display,
            output: result.output, reasoning: result.reasoning, durationMs: result.durationMs,
            cached: result.cached, hit429: result.hit429,
          };
          break;
        }
        case "outline": {
          if (!outputs.needs || !outputs.audience || !outputs.objectives) {
            throw new Error("outline 需要 needs/audience/objectives 上游");
          }
          const result = await runSkill(outlineSkill, {
            needs: outputs.needs,
            audience: outputs.audience,
            objectives: outputs.objectives,
            preferredTotalHours: options.preferredTotalHours,
            similarClassNames: similarClasses.map((s) => s.className),
          }, sharedRunOpts);
          outputs.outline = result.output;
          lastResult = result;
          yield {
            type: "skill_complete", skill: skillName, displayName: display,
            output: result.output, reasoning: result.reasoning, durationMs: result.durationMs,
            cached: result.cached, hit429: result.hit429,
          };
          break;
        }
        case "format": {
          if (!outputs.audience || !outputs.outline) throw new Error("format 需要 audience/outline 上游");
          const result = await runSkill(formatSkill, {
            audience: outputs.audience,
            outline: outputs.outline,
          }, sharedRunOpts);
          outputs.format = result.output;
          lastResult = result;
          yield {
            type: "skill_complete", skill: skillName, displayName: display,
            output: result.output, reasoning: result.reasoning, durationMs: result.durationMs,
            cached: result.cached, hit429: result.hit429,
          };
          break;
        }
        case "instructor": {
          if (!outputs.outline) throw new Error("instructor 需要 outline 上游");
          // 為每堂課跑 4 來源候選人查詢
          const rawCandidates = await Promise.all(
            outputs.outline.sessions.map(async (s) => {
              const bundle = await lookupAllSources(userId, s.name, { limit: 5 });
              return {
                sessionPosition: s.position,
                sessionName: s.name,
                personalContacts: bundle.personalContacts as Candidate[],
                trainers: bundle.trainers as Candidate[],
                historyInstructors: bundle.historyInstructors as Candidate[],
                webResults: bundle.webResults as Candidate[],
              };
            }),
          );
          // 削減每個來源候選人到上限（預設 3 位／來源），降低 instructor Skill 的 input token
          const candidatesPerSession = pruneCandidatesPerSession(rawCandidates);
          const result = await runSkill(instructorSkill, {
            outline: outputs.outline,
            candidatesPerSession,
          }, sharedRunOpts);
          outputs.instructor = result.output;
          lastResult = result;
          yield {
            type: "skill_complete", skill: skillName, displayName: display,
            output: result.output, reasoning: result.reasoning, durationMs: result.durationMs,
            cached: result.cached, hit429: result.hit429,
          };
          break;
        }
        case "schedule": {
          if (!outputs.outline || !outputs.format) throw new Error("schedule 需要 outline/format 上游");
          const result = await runSkill(scheduleSkill, {
            outline: outputs.outline,
            format: outputs.format,
            preferredDays: options.preferredDays,
          }, sharedRunOpts);
          outputs.schedule = result.output;
          lastResult = result;
          yield {
            type: "skill_complete", skill: skillName, displayName: display,
            output: result.output, reasoning: result.reasoning, durationMs: result.durationMs,
            cached: result.cached, hit429: result.hit429,
          };
          break;
        }
        case "materials": {
          if (!outputs.outline) throw new Error("materials 需要 outline 上游");
          const result = await runSkill(materialsSkill, {
            outline: outputs.outline,
          }, sharedRunOpts);
          outputs.materials = result.output;
          lastResult = result;
          yield {
            type: "skill_complete", skill: skillName, displayName: display,
            output: result.output, reasoning: result.reasoning, durationMs: result.durationMs,
            cached: result.cached, hit429: result.hit429,
          };
          break;
        }
        case "assessment": {
          if (!outputs.objectives || !outputs.outline) throw new Error("assessment 需要 objectives/outline 上游");
          const result = await runSkill(assessmentSkill, {
            objectives: outputs.objectives,
            outline: outputs.outline,
          }, sharedRunOpts);
          outputs.assessment = result.output;
          lastResult = result;
          yield {
            type: "skill_complete", skill: skillName, displayName: display,
            output: result.output, reasoning: result.reasoning, durationMs: result.durationMs,
            cached: result.cached, hit429: result.hit429,
          };
          break;
        }
        case "notification": {
          if (!outputs.schedule || !outputs.format) throw new Error("notification 需要 schedule/format 上游");
          const result = await runSkill(notificationSkill, {
            schedule: outputs.schedule,
            format: outputs.format,
          }, sharedRunOpts);
          outputs.notification = result.output;
          lastResult = result;
          yield {
            type: "skill_complete", skill: skillName, displayName: display,
            output: result.output, reasoning: result.reasoning, durationMs: result.durationMs,
            cached: result.cached, hit429: result.hit429,
          };
          break;
        }
        case "promo": {
          if (!outputs.audience || !outputs.outline || !outputs.schedule || !outputs.instructor) {
            throw new Error("promo 需要 audience/outline/schedule/instructor 上游");
          }
          const result = await runSkill(promoSkill, {
            audience: outputs.audience,
            outline: outputs.outline,
            schedule: outputs.schedule,
            instructor: outputs.instructor,
          }, sharedRunOpts);
          outputs.promo = result.output;
          lastResult = result;
          yield {
            type: "skill_complete", skill: skillName, displayName: display,
            output: result.output, reasoning: result.reasoning, durationMs: result.durationMs,
            cached: result.cached, hit429: result.hit429,
          };
          break;
        }
      }

      // 動態調整下一個 Skill 的 delay：429 越多 → delay 越大（指數），全平順 → 慢慢回到 base
      if (lastResult?.hit429) {
        consecutive429 += 1;
        // 連續 1 次 → 9s；2 次 → 18s；3 次以上 → 30s（cap）
        const factor = Math.min(2 ** consecutive429, 8);
        currentDelayMs = Math.min(baseDelayMs * factor, maxDelayMs);
        console.warn(
          `[course-planner orchestrator] ${skillName} 命中 429，下一個 Skill 間隔放大為 ${currentDelayMs}ms（連續 ${consecutive429} 次）`,
        );
      } else if (lastResult?.cached) {
        // 走 cache 完全沒打 LLM → 不需 delay
        consecutive429 = 0;
        currentDelayMs = 0;
      } else {
        consecutive429 = 0;
        currentDelayMs = baseDelayMs;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[course-planner orchestrator] Skill ${skillName} failed:`, message);
      await prisma.coursePlanRequest.update({
        where: { id: requestId },
        data: { status: "failed", currentSkill: skillName },
      });
      yield { type: "skill_failed", skill: skillName, displayName: display, error: message };
      yield { type: "error", message: `${display} 執行失敗：${message}` };
      return;
    }
  }

  // ============================================================
  // 整合最終 form + aux docs
  // ============================================================
  const required: (keyof AllSkillOutputs)[] = [
    "needs",
    "audience",
    "objectives",
    "outline",
    "format",
    "instructor",
    "schedule",
  ];
  const missing = required.filter((k) => !outputs[k]);
  if (missing.length > 0) {
    yield {
      type: "error",
      message: `必要 Skill 未完成：${missing.join(", ")}（無法整合最終開班計畫表）`,
    };
    await prisma.coursePlanRequest.update({
      where: { id: requestId },
      data: { status: "failed" },
    });
    return;
  }

  const form = buildCoursePlanForm(outputs as AllSkillOutputs);
  const auxDocs = buildAuxiliaryDocs(outputs as AllSkillOutputs);

  await prisma.coursePlanRequest.update({
    where: { id: requestId },
    data: {
      status: "completed",
      currentSkill: null,
      finalForm: form as Prisma.InputJsonValue,
      finalAuxDocs: auxDocs as Prisma.InputJsonValue,
    },
  });

  yield { type: "complete", form, auxDocs };
}
