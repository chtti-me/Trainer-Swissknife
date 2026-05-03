/**
 * Gradient 模板 blueprint — 漸層流光
 *
 * 敘事：「展望未來的邀請」。
 * - eyebrow 用「FUTURE · 願景」這類前瞻字眼
 * - hero 後接一段流暢散文式的 pain + solution，不切碎、不條列
 * - 課程表用 card 呈現（已在 styles.ts 配置），呼應「未來感」
 * - CTA 大圓角、柔和語調，例如「加入這場學習旅程」
 */

import type { Block } from '@edm/types/blocks';
import {
  type BlueprintCtx,
  buildAudienceCopy,
  buildFooterText,
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

export function buildGradientBlueprint(ctx: BlueprintCtx): Block[] {
  const { plan, copy: c, heroImage } = ctx;

  return compact<Block>([
    hero({
      image: heroImage,
      eyebrow: 'FUTURE · 願景',
      title: c?.headline || plan.title || '[班名]',
      subtitle: plan.classCode || '[班代號]',
      mirrorTitleToCopy: Boolean(c?.headline),
    }),
    headline({
      text: c?.subheadline || '在變化裡找到你的位置',
      align: 'left',
      size: 'lg',
      // v0.7.4：模板名稱就叫 gradient，主敘事 headline 當然要漸層字
      effect: 'gradient-text',
      mirrorTextToCopy: c?.subheadline ? 'subheadline' : undefined,
    }),

    // 流暢敘事段：pain + solution，不切碎
    painCopy(c, 'p'),
    solutionCopy(c, 'p'),

    divider('solid'),

    classDate(plan),
    classTime(plan),

    headline({ text: '課程脈絡', align: 'left', size: 'md' }),
    courseTable(plan),

    headline({ text: '為什麼是現在', align: 'left', size: 'md' }),
    whyForYouCopy(c, 'modern'),

    buildAudienceCopy(plan),
    instructor(plan, '主講導師'),

    divider('solid'),

    cta({
      label: c?.cta || '加入這場旅程',
      url: plan.registrationUrl,
      // v0.7.4：呼應模板名 — 漸層按鈕（primary→accent）+ 大圓角 + 中等陰影
      style: 'gradient',
      radius: 'lg',
      shadow: 'md',
      secondary: plan.syllabusUrl ? { label: '展開完整脈絡', url: plan.syllabusUrl } : undefined,
      mirrorLabelToCopy: Boolean(c?.cta),
    }),

    footer(buildFooterText(plan, '我們在線上等你。')),
  ]);
}
