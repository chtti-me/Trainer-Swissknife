/**
 * Editorial 模板 blueprint — 編輯特輯
 *
 * 敘事：「主管刊物的本期特輯」。比 magazine 更厚重、更有「閱讀價值」感。
 * - eyebrow：「ISSUE · 領導者特輯」
 * - 開場 pain 段用 drop-cap 第一字放大（lead variant）
 * - 章節用「I. II. III.」羅馬數字（不用 §01 §02）
 * - whyForYou 改稱「重點摘錄」
 * - CTA 全大寫方角，「READ THIS ISSUE / 閱讀本期」
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

export function buildEditorialBlueprint(ctx: BlueprintCtx): Block[] {
  const { plan, copy: c, heroImage } = ctx;

  const blocks: Array<Block | null> = [
    hero({
      image: heroImage,
      eyebrow: 'ISSUE · 領導者特輯',
      title: c?.headline || plan.title || '[班名]',
      subtitle: plan.classCode || '[班代號]',
      mirrorTitleToCopy: Boolean(c?.headline),
    }),
    headline({
      text: c?.subheadline || '這一期，談的是領導力',
      align: 'left',
      size: 'lg',
      // v0.7.4：刊物特輯 — 字重 700 + 淡入，呼應「翻開本期」的儀式感
      weight: 700,
      effect: 'fade-in',
      mirrorTextToCopy: c?.subheadline ? 'subheadline' : undefined,
    }),
  ];

  // 開場 pain：drop-cap 第一字放大
  blocks.push(painCopy(c, 'lead'));

  blocks.push(divider('solid'));

  // I. 本期重點
  blocks.push(headline({ text: 'I.　本期重點', align: 'left', size: 'md' }));
  blocks.push(solutionCopy(c, 'p'));

  // II. 課程章節
  if (plan.courses.length > 0) {
    blocks.push(divider('solid'));
    blocks.push(headline({ text: 'II.　課程章節', align: 'left', size: 'md' }));
    blocks.push(courseTable(plan));
  }

  // III. 重點摘錄
  if (c?.whyForYou?.length) {
    blocks.push(divider('solid'));
    blocks.push(headline({ text: 'III.　重點摘錄', align: 'left', size: 'md' }));
    blocks.push(whyForYouCopy(c, 'editorial'));
  }

  // IV. 上課資訊
  blocks.push(divider('solid'));
  blocks.push(headline({ text: 'IV.　上課資訊', align: 'left', size: 'md' }));
  blocks.push(classDate(plan));
  blocks.push(classTime(plan));
  if (plan.location) blocks.push(copy(`<p><strong>形式　</strong>${plan.location}</p>`));
  if (plan.audience.length > 0) {
    blocks.push(copy(`<p><strong>對象　</strong>${plan.audience.join('、')}</p>`));
  }

  blocks.push(instructor(plan, '本期主編'));

  blocks.push(divider('solid'));

  blocks.push(
    cta({
      label: c?.cta || '閱讀本期',
      url: plan.registrationUrl,
      // v0.7.4：刊物式克制 — outline 方角，呼應 editorial 的厚重排版
      style: 'outline',
      radius: 'square',
      shadow: 'none',
      secondary: plan.syllabusUrl ? { label: '訂閱本系列', url: plan.syllabusUrl } : undefined,
      mirrorLabelToCopy: Boolean(c?.cta),
    }),
  );

  blocks.push(footer(buildFooterText(plan, '本期特輯完。')));

  return compact<Block>(blocks);
}
