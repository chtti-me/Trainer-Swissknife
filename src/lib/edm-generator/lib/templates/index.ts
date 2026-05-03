/**
 * 模板入口（dispatcher）
 *
 * - `TEMPLATES`：列出 6 個模板的 meta，給 TemplatePanel 顯示卡片
 * - `buildBlocksForTemplate(id, opts)`：依 templateId 路由到 blueprint，
 *   產出該模板專屬的 block 序列（v0.3.0 起每個模板序列截然不同）
 *
 * 模板差異化的單一資料來源：
 * - 視覺規格（typography / divider / hero variant / CTA shape）→ `./styles.ts`
 * - 結構規格（block 順序 / headline 措辭 / 章節）        → `./blueprints/*.ts`
 */

import type { Block } from '@edm/types/blocks';
import type { ClassPlan } from '@edm/types/classPlan';
import type { GeneratedCopy } from '@edm/types/copy';
import { TEMPLATE_STYLE_LIST } from '@edm/lib/templates/styles';
import { getBlueprint } from './blueprints';
import type { BlueprintCtx } from './helpers';

export interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  paletteHint: string;
  preview: string;
}

/** 模板 Meta 取自 TemplateStyle，避免兩處重複維護 */
export const TEMPLATES: TemplateMeta[] = TEMPLATE_STYLE_LIST.map((s) => ({
  id: s.id,
  name: s.name,
  description: s.description,
  paletteHint: s.recommendedPaletteId,
  preview: s.id,
}));

export interface BuildOpts {
  plan: ClassPlan;
  copy?: GeneratedCopy | null;
  heroImage?: string;
}

export function buildBlocksForTemplate(templateId: string, opts: BuildOpts): Block[] {
  const ctx: BlueprintCtx = {
    plan: opts.plan,
    copy: opts.copy,
    heroImage: opts.heroImage,
  };
  return getBlueprint(templateId)(ctx);
}
