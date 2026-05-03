/**
 * Bulletin 模板 blueprint — 公告佈告
 *
 * 敘事：「報名截止前的最後通知」。
 * - 用「公告」eyebrow 增添急切感
 * - hero 標題下方緊跟「上課日期 + 上課時間 + 名額」公告式三段
 * - 用 declarative solution（「本班規劃 — ...」）強調公告體
 * - 用 tri-band divider 切段（已在 styles.ts 配置）
 * - CTA 用方角直線、強調動詞，例如「立即報名（限額已開放）」
 */

import type { Block } from '@edm/types/blocks';
import {
  type BlueprintCtx,
  buildAudienceCopy,
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

export function buildBulletinBlueprint(ctx: BlueprintCtx): Block[] {
  const { plan, copy: c, heroImage } = ctx;

  return compact<Block>([
    hero({
      image: heroImage,
      eyebrow: '公告 · 開班通知',
      title: c?.headline || plan.title || '[班名]',
      subtitle: plan.classCode || '[班代號]',
      mirrorTitleToCopy: Boolean(c?.headline),
    }),

    // 公告式起手段：上課日期、時間立刻就要看到
    classDate(plan),
    classTime(plan),

    headline({
      text: c?.subheadline || '即日起開放報名',
      align: 'left',
      size: 'sm',
      // v0.7.4：公告語氣 — 字重 700 強化「通知感」
      weight: 700,
      mirrorTextToCopy: c?.subheadline ? 'subheadline' : undefined,
    }),

    painCopy(c, 'p'),
    solutionCopy(c, 'declarative'),

    divider('solid'),
    courseTable(plan),
    whyForYouCopy(c, 'default'),

    buildAudienceCopy(plan),
    instructor(plan, '本班導師'),

    // 急迫感的提醒 copy（純結構，不對映 GeneratedCopy）
    copy('<p><strong>提醒：</strong>名額有限，依報名順序錄取，額滿截止。</p>'),

    cta({
      label: c?.cta || '立即報名',
      url: plan.registrationUrl,
      // v0.7.4：公告強引導 — 滿版 + 小圓角 + 微陰影，讀者一定按得到
      style: 'primary',
      radius: 'sm',
      shadow: 'sm',
      fullWidth: true,
      secondary: plan.syllabusUrl ? { label: '查看開班計畫表', url: plan.syllabusUrl } : undefined,
      mirrorLabelToCopy: Boolean(c?.cta),
    }),

    divider('solid'),
    footer(buildFooterText(plan, '謹此公告。')),
  ]);
}
