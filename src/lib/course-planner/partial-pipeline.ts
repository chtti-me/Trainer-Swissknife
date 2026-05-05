/**
 * 課程規劃工具箱 — Partial Pipeline Orchestrator
 *
 * 與正式 11-Skill orchestrator 的差異：
 *   1. 只跑使用者勾選的 Skills + 自動補上的傳遞依賴上游
 *   2. 不做既有班搜尋（既有班沿用是「整個規劃」層次的決策）
 *   3. 不做 auto-title（toolbox 用後即丟，不需要漂亮標題）
 *   4. 不合成最終 form / aux docs（單 skill 結果由前端顯示與匯出）
 *   5. 跑完狀態為 "toolbox_done"（不污染主規劃單列表）
 *
 * 兩種起點：
 *   - rawText（mode A）：建立新 toolbox CoursePlanRequest，從 needs 開始補上游
 *   - referenceRequestId（mode B）：建立新 toolbox CoursePlanRequest，從來源規劃單複製
 *     已成功的上游 SkillRun 結果作為 existingOutputs，只跑缺的部分
 */
import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AiProvider } from "@/lib/ai-provider";
import { lookupAllSources } from "./instructor-lookup";
import { runSkill, loadSkillContext } from "./skills/_base";
import { pruneCandidatesPerSession } from "./output-pruner";
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
import {
  LLM_SKILL_NAMES,
  SKILL_DISPLAY_NAMES,
  type LlmSkillName,
  type SkillName,
} from "./schemas/common";
import type { Candidate } from "./schemas/instructor";
import type { AllSkillOutputs } from "./form-mapper";
import { resolveRequiredSkills, splitDisplayedAndAuxiliary } from "./skill-toolbox";

export type PartialPipelineEvent =
  | { type: "request_started"; requestId: string; required: LlmSkillName[]; displayed: LlmSkillName[]; auxiliary: LlmSkillName[] }
  | { type: "skill_start"; skill: SkillName; displayName: string; isAuxiliary: boolean }
  | {
      type: "skill_complete";
      skill: SkillName;
      displayName: string;
      isAuxiliary: boolean;
      output: unknown;
      reasoning: string;
      durationMs: number;
      cached?: boolean;
      hit429?: boolean;
    }
  | { type: "skill_failed"; skill: SkillName; displayName: string; error: string }
  | { type: "complete"; durationMs: number }
  | { type: "error"; message: string };

export interface PartialPipelineOptions {
  /** 使用者 ID（建單時要寫入） */
  userId: string;
  /** 起點：模式 A —— 一段 raw text，從 needs 跑起 */
  rawText?: string;
  /** 起點：模式 B —— 從某個既有規劃單帶上游 */
  referenceRequestId?: string;
  /** 使用者勾選的 Skills（必填）；系統會自動補上游 */
  selectedSkills: LlmSkillName[];
  /** AI 供應商覆寫；不傳走 env */
  provider?: AiProvider | null;
  /** outline 對 preferredTotalHours 的傳遞（選填） */
  preferredTotalHours?: number;
  /** schedule 對 preferredDays 的傳遞（選填） */
  preferredDays?: number;
}

/**
 * 從來源規劃單複製「上游 LLM Skill 的最新成功 output」作為 existingOutputs。
 * 只回傳實際存在的、status=success 的 latest run。
 */
async function loadUpstreamOutputsFromSourceRequest(
  sourceRequestId: string,
  userId: string,
): Promise<{ rawInputText: string; outputs: Partial<AllSkillOutputs> } | { error: string }> {
  const src = await prisma.coursePlanRequest.findFirst({
    where: { id: sourceRequestId, createdBy: userId },
    select: { id: true, rawInputText: true },
  });
  if (!src) return { error: `找不到來源規劃單 ${sourceRequestId}（或不屬於當前使用者）` };

  const runs = await prisma.coursePlanSkillRun.findMany({
    where: {
      requestId: sourceRequestId,
      status: "success",
      skillName: { in: [...LLM_SKILL_NAMES] as unknown as string[] },
    },
    orderBy: [{ skillName: "asc" }, { sequence: "desc" }],
    select: { skillName: true, output: true },
  });
  const latestBySkill = new Map<string, unknown>();
  for (const r of runs) {
    if (!latestBySkill.has(r.skillName)) latestBySkill.set(r.skillName, r.output);
  }
  return {
    rawInputText: src.rawInputText,
    outputs: Object.fromEntries(latestBySkill.entries()) as Partial<AllSkillOutputs>,
  };
}

export async function* runPartialPipeline(
  options: PartialPipelineOptions,
): AsyncGenerator<PartialPipelineEvent, void, unknown> {
  const startedAt = Date.now();

  // ============================================================
  // 1. 解析依賴 & 排序
  // ============================================================
  const required = resolveRequiredSkills(options.selectedSkills);
  const { displayed, auxiliary } = splitDisplayedAndAuxiliary(options.selectedSkills, required);

  // ============================================================
  // 2. 解析起點 + 建立 toolbox CoursePlanRequest
  // ============================================================
  let rawInputText = "";
  let existingOutputs: Partial<AllSkillOutputs> = {};

  if (options.referenceRequestId) {
    const result = await loadUpstreamOutputsFromSourceRequest(
      options.referenceRequestId,
      options.userId,
    );
    if ("error" in result) {
      yield { type: "error", message: result.error };
      return;
    }
    rawInputText = result.rawInputText;
    existingOutputs = result.outputs;
  } else if (options.rawText && options.rawText.trim().length >= 10) {
    rawInputText = options.rawText.trim();
  } else {
    yield {
      type: "error",
      message: "請提供 rawText（至少 10 字）或 referenceRequestId 兩者擇一",
    };
    return;
  }

  const titleHint = `[課程規劃工具箱] ${displayed.map((s) => SKILL_DISPLAY_NAMES[s]).join(" + ")}`;
  const request = await prisma.coursePlanRequest.create({
    data: {
      createdBy: options.userId,
      title: titleHint.length > 80 ? titleHint.slice(0, 78) + "…" : titleHint,
      rawInputText,
      status: "running",
      kind: "toolbox",
      aiProvider: options.provider ?? null,
    },
    select: { id: true },
  });
  const requestId = request.id;

  yield { type: "request_started", requestId, required, displayed, auxiliary };

  // ============================================================
  // 3. 載入 AI 技能脈絡（每位使用者個人 + 全院共用 course_planning 系列）
  // ============================================================
  const skillContextAppend = await loadSkillContext(options.userId);

  // ============================================================
  // 4. 依序跑每個 required Skill
  // ============================================================
  const outputs: Partial<AllSkillOutputs> = { ...existingOutputs };
  const baseDelayMs = Number(process.env.COURSE_PLANNER_SKILL_DELAY_MS ?? "4500");
  let isFirstActualCall = true;
  const sharedRunOpts = {
    requestId,
    skillContextAppend,
    forceRerun: false,
    provider: options.provider ?? null,
  };
  const auxSet = new Set(auxiliary);

  for (const skillName of required) {
    const display = SKILL_DISPLAY_NAMES[skillName];
    const isAuxiliary = auxSet.has(skillName);

    // 來自 referenceRequest 的上游已經有 output 了 → skip 但 emit complete event
    if (outputs[skillName as keyof AllSkillOutputs]) {
      yield {
        type: "skill_complete",
        skill: skillName,
        displayName: display,
        isAuxiliary,
        output: outputs[skillName as keyof AllSkillOutputs],
        reasoning: "從來源規劃單帶入既有結果（未重跑）",
        durationMs: 0,
        cached: true,
      };
      continue;
    }

    // Skill 之間最少間隔（避免 free tier 429）
    if (!isFirstActualCall && baseDelayMs > 0) {
      await new Promise((r) => setTimeout(r, baseDelayMs));
    }
    isFirstActualCall = false;

    yield { type: "skill_start", skill: skillName, displayName: display, isAuxiliary };

    try {
      switch (skillName) {
        case "needs": {
          const result = await runSkill(needsSkill, {
            rawInputText,
            similarExistingClasses: [],
          }, sharedRunOpts);
          outputs.needs = result.output;
          yield emitComplete(skillName, display, isAuxiliary, result);
          break;
        }
        case "audience": {
          requireOutput(outputs, "needs", "audience");
          const result = await runSkill(audienceSkill, { needs: outputs.needs! }, sharedRunOpts);
          outputs.audience = result.output;
          yield emitComplete(skillName, display, isAuxiliary, result);
          break;
        }
        case "objectives": {
          requireOutput(outputs, "needs", "objectives");
          requireOutput(outputs, "audience", "objectives");
          const result = await runSkill(objectivesSkill, {
            needs: outputs.needs!,
            audience: outputs.audience!,
          }, sharedRunOpts);
          outputs.objectives = result.output;
          yield emitComplete(skillName, display, isAuxiliary, result);
          break;
        }
        case "outline": {
          requireOutput(outputs, "needs", "outline");
          requireOutput(outputs, "audience", "outline");
          requireOutput(outputs, "objectives", "outline");
          const result = await runSkill(outlineSkill, {
            needs: outputs.needs!,
            audience: outputs.audience!,
            objectives: outputs.objectives!,
            preferredTotalHours: options.preferredTotalHours,
            similarClassNames: [],
          }, sharedRunOpts);
          outputs.outline = result.output;
          yield emitComplete(skillName, display, isAuxiliary, result);
          break;
        }
        case "format": {
          requireOutput(outputs, "audience", "format");
          requireOutput(outputs, "outline", "format");
          const result = await runSkill(formatSkill, {
            audience: outputs.audience!,
            outline: outputs.outline!,
          }, sharedRunOpts);
          outputs.format = result.output;
          yield emitComplete(skillName, display, isAuxiliary, result);
          break;
        }
        case "instructor": {
          requireOutput(outputs, "outline", "instructor");
          const rawCandidates = await Promise.all(
            outputs.outline!.sessions.map(async (s) => {
              const bundle = await lookupAllSources(options.userId, s.name, { limit: 5 });
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
          const candidatesPerSession = pruneCandidatesPerSession(rawCandidates);
          const result = await runSkill(instructorSkill, {
            outline: outputs.outline!,
            candidatesPerSession,
          }, sharedRunOpts);
          outputs.instructor = result.output;
          yield emitComplete(skillName, display, isAuxiliary, result);
          break;
        }
        case "schedule": {
          requireOutput(outputs, "outline", "schedule");
          requireOutput(outputs, "format", "schedule");
          const result = await runSkill(scheduleSkill, {
            outline: outputs.outline!,
            format: outputs.format!,
            preferredDays: options.preferredDays,
          }, sharedRunOpts);
          outputs.schedule = result.output;
          yield emitComplete(skillName, display, isAuxiliary, result);
          break;
        }
        case "materials": {
          requireOutput(outputs, "outline", "materials");
          const result = await runSkill(materialsSkill, {
            outline: outputs.outline!,
          }, sharedRunOpts);
          outputs.materials = result.output;
          yield emitComplete(skillName, display, isAuxiliary, result);
          break;
        }
        case "assessment": {
          requireOutput(outputs, "objectives", "assessment");
          requireOutput(outputs, "outline", "assessment");
          const result = await runSkill(assessmentSkill, {
            objectives: outputs.objectives!,
            outline: outputs.outline!,
          }, sharedRunOpts);
          outputs.assessment = result.output;
          yield emitComplete(skillName, display, isAuxiliary, result);
          break;
        }
        case "notification": {
          requireOutput(outputs, "schedule", "notification");
          requireOutput(outputs, "format", "notification");
          const result = await runSkill(notificationSkill, {
            schedule: outputs.schedule!,
            format: outputs.format!,
          }, sharedRunOpts);
          outputs.notification = result.output;
          yield emitComplete(skillName, display, isAuxiliary, result);
          break;
        }
        case "promo": {
          requireOutput(outputs, "audience", "promo");
          requireOutput(outputs, "outline", "promo");
          requireOutput(outputs, "schedule", "promo");
          requireOutput(outputs, "instructor", "promo");
          const result = await runSkill(promoSkill, {
            audience: outputs.audience!,
            outline: outputs.outline!,
            schedule: outputs.schedule!,
            instructor: outputs.instructor!,
          }, sharedRunOpts);
          outputs.promo = result.output;
          yield emitComplete(skillName, display, isAuxiliary, result);
          break;
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[partial-pipeline] Skill ${skillName} failed:`, message);
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
  // 5. 收尾：標記 toolbox_done（與一般 completed 區分）
  // ============================================================
  await prisma.coursePlanRequest.update({
    where: { id: requestId },
    data: {
      status: "toolbox_done",
      currentSkill: null,
      // 不寫 finalForm／finalAuxDocs：toolbox 不合成最終 form
      finalForm: Prisma.DbNull,
      finalAuxDocs: Prisma.DbNull,
    },
  });

  yield { type: "complete", durationMs: Date.now() - startedAt };
}

// ============================================================
// helpers
// ============================================================
function emitComplete(
  skill: SkillName,
  displayName: string,
  isAuxiliary: boolean,
  result: { output: unknown; reasoning: string; durationMs: number; cached?: boolean; hit429?: boolean },
): PartialPipelineEvent {
  return {
    type: "skill_complete",
    skill,
    displayName,
    isAuxiliary,
    output: result.output,
    reasoning: result.reasoning,
    durationMs: result.durationMs,
    cached: result.cached,
    hit429: result.hit429,
  };
}

function requireOutput(
  outputs: Partial<AllSkillOutputs>,
  key: keyof AllSkillOutputs,
  callerSkill: string,
): void {
  if (!outputs[key]) {
    throw new Error(`${callerSkill} 缺少上游 ${key} 輸出（依賴解析應該已自動補上，請回報 bug）`);
  }
}
