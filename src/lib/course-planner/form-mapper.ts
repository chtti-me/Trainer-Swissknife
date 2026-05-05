/**
 * 課程規劃幫手 — 從 11 個 Skill outputs 組合出最終的開班計畫表 + 4 輔助文件
 *
 * 這支沒有 LLM，只有純函式對映。Skill outputs → form fields。
 */
import "server-only";

import type { NeedsOutput } from "./schemas/needs";
import type { AudienceOutput } from "./schemas/audience";
import type { ObjectivesOutput } from "./schemas/objectives";
import type { OutlineOutput } from "./schemas/outline";
import type { FormatOutput } from "./schemas/format";
import type { InstructorOutput } from "./schemas/instructor";
import type { ScheduleOutput } from "./schemas/schedule";
import type { PromoOutput } from "./schemas/promo";
import type { NotificationOutput } from "./schemas/notification";
import type { MaterialsOutput } from "./schemas/materials";
import type { AssessmentOutput } from "./schemas/assessment";
import {
  type AiFilled,
  type AuxiliaryDocs,
  type CoursePlanForm,
  type SessionItem,
  ManualFieldsSchema,
} from "./schemas/form";

export interface AllSkillOutputs {
  needs: NeedsOutput;
  audience: AudienceOutput;
  objectives: ObjectivesOutput;
  outline: OutlineOutput;
  format: FormatOutput;
  instructor: InstructorOutput;
  schedule: ScheduleOutput;
  promo?: PromoOutput;
  notification?: NotificationOutput;
  materials?: MaterialsOutput;
  assessment?: AssessmentOutput;
}

/**
 * 把 7 個「直接填表」Skill 的輸出合成 AiFilled 區塊。
 * 4 個輔助 Skill 中只有 materials / notification 會影響 form 欄位，其他純輔助文件。
 */
export function buildAiFilled(out: AllSkillOutputs): AiFilled {
  const sessions: SessionItem[] = out.outline.sessions.map((s) => {
    const match = out.instructor.matches.find((m) => m.sessionPosition === s.position);
    return {
      position: s.position,
      name: s.name,
      hours: s.hours,
      type: s.type,
      description: s.description,
      keyPoints: s.keyPoints ?? [],
      inClassActivity: s.inClassActivity ?? "",
      studentTakeaway: s.studentTakeaway ?? "",
      linkedObjectiveIds: s.linkedObjectiveIds,
      primaryInstructorName: match?.primary.name,
      alternativeInstructorNames: match?.alternatives.map((a) => a.name) ?? [],
    };
  });

  // 課程特色：以 outline.courseFeatures 為主，再追加 materials.inClassFeatures（去重）
  const features = new Set<string>(out.outline.courseFeatures);
  out.materials?.inClassFeatures.forEach((f) => features.add(f));

  return {
    topic: out.outline.finalTopic,
    objectives: out.objectives.objectives.map((o) => o.statement),
    audience: out.audience.primaryAudience,
    notSuitableFor: out.audience.notSuitableFor,
    prerequisites: out.audience.prerequisites,
    courseFeatures: Array.from(features),
    sessions,
    caseRationale: out.needs.caseRationale,
  };
}

export function buildAuxiliaryDocs(out: AllSkillOutputs): AuxiliaryDocs {
  return {
    promo: out.promo
      ? {
          title: out.promo.title,
          shortIntro: out.promo.shortIntro,
          fullDescription: out.promo.fullDescription,
          benefitBullets: out.promo.benefitBullets,
          callToAction: out.promo.callToAction,
        }
      : null,
    notification: out.notification
      ? {
          subject: out.notification.subject,
          body: out.notification.body,
          checklistBeforeClass: out.notification.checklistBeforeClass,
        }
      : null,
    materials: out.materials
      ? {
          slides: out.materials.slides,
          handouts: out.materials.handouts,
          examples: out.materials.examples,
          exercises: out.materials.exercises,
        }
      : null,
    assessment: out.assessment
      ? {
          preAssessment: out.assessment.preAssessment,
          inClassTasks: out.assessment.inClassTasks,
          postAssessment: out.assessment.postAssessment,
          finalProject: out.assessment.finalProject,
          managerObservationForm: out.assessment.managerObservationForm,
        }
      : null,
  };
}

export function buildCoursePlanForm(out: AllSkillOutputs): CoursePlanForm {
  return {
    aiFilled: buildAiFilled(out),
    manual: ManualFieldsSchema.parse({}),
  };
}

/**
 * Skill 重跑後合併新舊 outputs 的工具：用 newOutputs 覆蓋 baseOutputs。
 */
export function mergeSkillOutputs(
  base: Partial<AllSkillOutputs>,
  newer: Partial<AllSkillOutputs>,
): AllSkillOutputs {
  return { ...base, ...newer } as AllSkillOutputs;
}
