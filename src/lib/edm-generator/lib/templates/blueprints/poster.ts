/**
 * Poster 模板 blueprint — 海報視覺
 *
 * 敘事：「大型講座的視覺海報」。
 * - eyebrow：「LIVE · 大型論壇」
 * - hero 巨大主標 + 副標
 * - 直接接「現場將呈現」清單（whyForYou:poster），不囉嗦痛點
 * - 課程表用 banded（隔行斑馬條紋，一目了然）
 * - CTA 全大寫 pill「報名」「KEEP MY SEAT」
 */

import type { Block } from '@edm/types/blocks';
import {
  type BlueprintCtx,
  buildFooterText,
  classDate,
  classTime,
  compact,
  copy,
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

export function buildPosterBlueprint(ctx: BlueprintCtx): Block[] {
  const { plan, copy: c, heroImage } = ctx;

  return compact<Block>([
    hero({
      image: heroImage,
      eyebrow: 'LIVE · 大型論壇',
      title: c?.headline || plan.title || '[班名]',
      subtitle: plan.classCode || '[班代號]',
      mirrorTitleToCopy: Boolean(c?.headline),
    }),

    headline({
      text: c?.subheadline || '一場不該錯過的現場',
      align: 'left',
      size: 'lg',
      // v0.7.4：海報視覺最強 — 漸層字 + 字重 800，像論壇主視覺看板
      weight: 800,
      effect: 'gradient-text',
      mirrorTextToCopy: c?.subheadline ? 'subheadline' : undefined,
    }),

    // 海報式三段：時間、地點、主題（顯眼）
    classDate(plan),
    classTime(plan),
    plan.location
      ? copy(`<p><strong>地點　</strong>${plan.location}</p>`)
      : null,

    divider('geometric'),

    // 現場將呈現（whyForYou，poster 變體）
    headline({ text: '現場將呈現', align: 'left', size: 'md' }),
    whyForYouCopy(c, 'poster'),

    // 短句 pain + solution（海報不囉嗦，留白要大）
    painCopy(c, 'p'),
    solutionCopy(c, 'p'),

    divider('geometric'),

    headline({ text: '議程一覽', align: 'left', size: 'md' }),
    courseTable(plan),

    instructor(plan, '主講人'),

    divider('geometric'),

    cta({
      label: c?.cta || '保留我的位置',
      url: plan.registrationUrl,
      // v0.7.4：海報主視覺 CTA — 漸層 + pill + 大陰影 + 滿版，最強烈的視覺呼喊
      style: 'gradient',
      radius: 'pill',
      shadow: 'lg',
      fullWidth: true,
      secondary: plan.syllabusUrl ? { label: '展開完整議程', url: plan.syllabusUrl } : undefined,
      mirrorLabelToCopy: Boolean(c?.cta),
    }),

    footer(buildFooterText(plan, '現場見。')),
  ]);
}
