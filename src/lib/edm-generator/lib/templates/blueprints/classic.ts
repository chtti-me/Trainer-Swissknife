/**
 * Classic 模板 blueprint — 經典商務
 *
 * 敘事：「正式商務開班通知」。對稱版型 + 完整四段（痛點 → 解方 → 課程 → 適合您）。
 * 維持 v0.2 既有結構，作為其他模板的 reference。
 */

import type { Block } from '@edm/types/blocks';
import {
  type BlueprintCtx,
  buildAudienceCopy,
  buildFooterText,
  buildObjectivesCopy,
  classDate,
  classTime,
  compact,
  courseTable,
  cta,
  divider,
  footer,
  headline,
  hero,
  instructor,
  painCopy,
  solutionCopy,
  whyForYouCopy,
} from '../helpers';

export function buildClassicBlueprint(ctx: BlueprintCtx): Block[] {
  const { plan, copy: c, heroImage } = ctx;

  return compact<Block>([
    hero({
      image: heroImage,
      eyebrow: '中華電信學院',
      title: c?.headline || plan.title || '[班名]',
      subtitle: plan.classCode || '[班代號]',
      mirrorTitleToCopy: Boolean(c?.headline),
    }),
    headline({
      text: c?.subheadline || '中華電信課程資訊 EDM',
      align: 'center',
      size: 'sm',
      mirrorTextToCopy: c?.subheadline ? 'subheadline' : undefined,
    }),
    classDate(plan),
    classTime(plan),

    painCopy(c, 'p'),
    c?.solution ? solutionCopy(c, 'prepared') : buildObjectivesCopy(plan),

    buildAudienceCopy(plan),
    courseTable(plan),
    whyForYouCopy(c, 'default'),
    instructor(plan),

    cta({
      label: c?.cta || '我要報名',
      url: plan.registrationUrl,
      // v0.7.4：商務穩重 — 中等圓角 + 微微陰影，不搶戲也不平板
      style: 'primary',
      radius: 'md',
      shadow: 'sm',
      secondary: plan.syllabusUrl ? { label: '查看開班計畫表', url: plan.syllabusUrl } : undefined,
      mirrorLabelToCopy: Boolean(c?.cta),
    }),
    divider('solid'),
    footer(buildFooterText(plan)),
  ]);
}
