/**
 * Kanban 模板 blueprint — 看板資訊
 *
 * 敘事：「PM 風的 ticket / sprint plan」。冷靜、條列、PM 術語。
 * - eyebrow：「SPRINT · 學習衝刺」
 * - 各章節用「• Backlog / Deliverables / Stakeholders」這類 PM 詞
 * - whyForYou 改稱「交付項目」
 * - 課程表用 card（每堂課一張卡）
 * - CTA 用「Pin to my plan」或「加入我的學習計畫」
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

export function buildKanbanBlueprint(ctx: BlueprintCtx): Block[] {
  const { plan, copy: c, heroImage } = ctx;

  return compact<Block>([
    hero({
      image: heroImage,
      eyebrow: 'SPRINT · 學習衝刺',
      title: c?.headline || plan.title || '[班名]',
      subtitle: plan.classCode || '[班代號]',
      mirrorTitleToCopy: Boolean(c?.headline),
    }),

    headline({
      text: c?.subheadline || '把學習當成你的下一個 sprint',
      align: 'left',
      size: 'sm',
      // v0.7.4：PM 行動感 — 字重 700，呼應 Sprint Goal 的決斷氛圍
      weight: 700,
      mirrorTextToCopy: c?.subheadline ? 'subheadline' : undefined,
    }),

    // Backlog（pain）
    headline({ text: 'Backlog · 為什麼開這班', align: 'left', size: 'md' }),
    painCopy(c, 'p'),
    solutionCopy(c, 'declarative'),

    divider('solid'),

    // Schedule（上課時間 / 日期）
    headline({ text: 'Schedule · 排程', align: 'left', size: 'md' }),
    classDate(plan),
    classTime(plan),

    divider('solid'),

    // Deliverables（whyForYou）
    headline({ text: 'Deliverables · 交付項目', align: 'left', size: 'md' }),
    whyForYouCopy(c, 'kanban'),

    divider('solid'),

    // Tasks（課程表）
    headline({ text: 'Tasks · 課程任務板', align: 'left', size: 'md' }),
    courseTable(plan),

    // Stakeholders（適合對象 / 上課方式 / 預備知識）
    headline({ text: 'Stakeholders · 利害關係人', align: 'left', size: 'md' }),
    plan.location ? copy(`<p><strong>· 形式　</strong>${plan.location}</p>`) : null,
    plan.audience.length > 0
      ? copy(`<p><strong>· 對象　</strong>${plan.audience.join('、')}</p>`)
      : null,
    plan.prerequisites
      ? copy(`<p><strong>· 預備　</strong>${plan.prerequisites}</p>`)
      : null,

    instructor(plan, 'Sprint Lead'),

    divider('solid'),

    cta({
      label: c?.cta || '加入我的學習計畫',
      url: plan.registrationUrl,
      // v0.7.4：PM 強引導 — 滿版 + 中等圓角 + 微陰影，像個被 PR 過的「Action 按鈕」
      style: 'primary',
      radius: 'md',
      shadow: 'sm',
      fullWidth: true,
      secondary: plan.syllabusUrl ? { label: '展開 Sprint Backlog', url: plan.syllabusUrl } : undefined,
      mirrorLabelToCopy: Boolean(c?.cta),
    }),

    footer(buildFooterText(plan, 'See you in the next stand-up.')),
  ]);
}
