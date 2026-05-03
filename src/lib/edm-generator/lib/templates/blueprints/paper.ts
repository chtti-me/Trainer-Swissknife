/**
 * Paper 模板 blueprint — 紙本信箋
 *
 * 敘事：「典雅信件」。襯線字、克制留白、謙抑語氣，適合人文 / 品德 / 傳統文化課。
 * - eyebrow：「謹此奉告」這類典雅詞
 * - hero 後接「敬啟者」開頭的稱呼段
 * - whyForYou 改稱「謹備如下」
 * - CTA 用「敬請報名」這類謙抑詞
 * - footer 用「敬上」結尾
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

export function buildPaperBlueprint(ctx: BlueprintCtx): Block[] {
  const { plan, copy: c, heroImage } = ctx;

  return compact<Block>([
    hero({
      image: heroImage,
      eyebrow: '謹此奉告',
      title: c?.headline || plan.title || '[班名]',
      subtitle: plan.classCode || '[班代號]',
      mirrorTitleToCopy: Boolean(c?.headline),
    }),

    headline({
      text: c?.subheadline || '誠摯邀請您一同前來',
      align: 'center',
      size: 'sm',
      mirrorTextToCopy: c?.subheadline ? 'subheadline' : undefined,
    }),

    // 信箋稱呼段（純結構，給予典雅感）
    copy('<p>敬啟者：</p>'),

    painCopy(c, 'p'),
    solutionCopy(c, 'declarative'),

    divider('solid'),

    classDate(plan),
    classTime(plan),

    headline({ text: '課程安排', align: 'center', size: 'md' }),
    courseTable(plan),

    headline({ text: '謹備如下', align: 'center', size: 'md' }),
    whyForYouCopy(c, 'paper'),

    instructor(plan, '主講老師'),

    divider('solid'),

    cta({
      label: c?.cta || '敬請報名',
      url: plan.registrationUrl,
      // v0.7.4：人文謙抑 — soft 柔和按鈕 + 中等圓角，無陰影，避免商業氣
      style: 'soft',
      radius: 'md',
      shadow: 'none',
      secondary: plan.syllabusUrl ? { label: '展讀完整章程', url: plan.syllabusUrl } : undefined,
      mirrorLabelToCopy: Boolean(c?.cta),
    }),

    footer(buildFooterText(plan, '敬上。')),
  ]);
}
