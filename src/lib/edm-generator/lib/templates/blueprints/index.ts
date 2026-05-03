/**
 * Blueprint registry — 把 templateId 對應到自己的 block 序列產生器
 *
 * 每個 blueprint 自己決定：
 *   - 要哪些 block / 哪些順序
 *   - 用什麼 headline / divider / CTA 措辭
 *   - 要不要插入章節編號、公文格式、引言段
 *
 * 共用工廠在 ../helpers.ts，模板差異純粹是 blueprint 的「組合方式」不同。
 */

import type { Block } from '@edm/types/blocks';
import type { BlueprintCtx } from '../helpers';
import { buildClassicBlueprint } from './classic';
import { buildModernBlueprint } from './modern';
import { buildMinimalBlueprint } from './minimal';
import { buildMagazineBlueprint } from './magazine';
import { buildAcademicBlueprint } from './academic';
import { buildVibrantBlueprint } from './vibrant';
// v0.6.0：新增 6 個模板
import { buildBulletinBlueprint } from './bulletin';
import { buildGradientBlueprint } from './gradient';
import { buildEditorialBlueprint } from './editorial';
import { buildPaperBlueprint } from './paper';
import { buildKanbanBlueprint } from './kanban';
import { buildPosterBlueprint } from './poster';

export type Blueprint = (ctx: BlueprintCtx) => Block[];

export const BLUEPRINTS: Record<string, Blueprint> = {
  classic: buildClassicBlueprint,
  modern: buildModernBlueprint,
  minimal: buildMinimalBlueprint,
  magazine: buildMagazineBlueprint,
  academic: buildAcademicBlueprint,
  vibrant: buildVibrantBlueprint,
  // v0.6.0
  bulletin: buildBulletinBlueprint,
  gradient: buildGradientBlueprint,
  editorial: buildEditorialBlueprint,
  paper: buildPaperBlueprint,
  kanban: buildKanbanBlueprint,
  poster: buildPosterBlueprint,
};

/** 找不到的 templateId 都退回 Classic */
export function getBlueprint(templateId: string): Blueprint {
  return BLUEPRINTS[templateId] ?? BLUEPRINTS.classic;
}
