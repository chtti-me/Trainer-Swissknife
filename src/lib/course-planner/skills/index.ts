import type { LlmSkillName } from "../schemas/common";
import { needsSkill } from "./needs";
import { audienceSkill } from "./audience";
import { objectivesSkill } from "./objectives";
import { outlineSkill } from "./outline";
import { formatSkill } from "./format";
import { instructorSkill } from "./instructor";
import { scheduleSkill } from "./schedule";
import { promoSkill } from "./promo";
import { notificationSkill } from "./notification";
import { materialsSkill } from "./materials";
import { assessmentSkill } from "./assessment";

export const SKILLS = {
  needs: needsSkill,
  audience: audienceSkill,
  objectives: objectivesSkill,
  outline: outlineSkill,
  format: formatSkill,
  instructor: instructorSkill,
  schedule: scheduleSkill,
  promo: promoSkill,
  notification: notificationSkill,
  materials: materialsSkill,
  assessment: assessmentSkill,
} as const;

export function getSkill(name: string) {
  if (!(name in SKILLS)) {
    throw new Error(`Unknown skill: ${name}. Available: ${Object.keys(SKILLS).join(", ")}`);
  }
  return SKILLS[name as LlmSkillName];
}

export {
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
};
