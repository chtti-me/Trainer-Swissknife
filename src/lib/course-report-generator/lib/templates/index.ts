/**
 * 【課程規劃報告產生器 - 模板註冊表】
 */
import type { Template } from "../../types/template";
import { modernCardTemplate } from "./modern-card";
import { corporateNavyTemplate } from "./corporate-navy";
import { vibrantHighlightTemplate } from "./vibrant-highlight";
import { minimalMonoTemplate } from "./minimal-mono";
import { memoClassicTemplate } from "./memo-classic";
import { freshEmeraldTemplate } from "./fresh-emerald";

export const TEMPLATES: Template[] = [
  modernCardTemplate,
  freshEmeraldTemplate,
  corporateNavyTemplate,
  vibrantHighlightTemplate,
  minimalMonoTemplate,
  memoClassicTemplate,
];

export function getTemplate(id: string | undefined | null): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
