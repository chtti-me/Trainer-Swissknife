/**
 * Vibrant 模板 blueprint — 活潑校園
 *
 * 敘事：「校園公布欄」。口語化、條列重於長段、波浪線分節。
 * - 用問句 headline 拉近距離（「你最近在煩什麼？」「我們幫你準備好了」）
 * - 用 bullet list 取代長段落
 * - 多個 wave divider（已在 styles.ts 配置）切出輕快節奏
 * - CTA 用 pill 大圓角
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

export function buildVibrantBlueprint(ctx: BlueprintCtx): Block[] {
  const { plan, copy: c, heroImage } = ctx;

  const blocks: Array<Block | null> = [
    hero({
      image: heroImage,
      eyebrow: 'NEW CLASS',
      title: c?.headline || plan.title || '[班名]',
      subtitle: plan.classCode || '[班代號]',
      mirrorTitleToCopy: Boolean(c?.headline),
    }),
    // 親近的副標
    headline({
      text: c?.subheadline || '加入我們，開始學習旅程',
      align: 'left',
      size: 'sm',
      // v0.7.4：vibrant 主敘事 — 漸層字 + 字重 800，呼應整體高彩度氛圍
      weight: 800,
      effect: 'gradient-text',
      mirrorTextToCopy: c?.subheadline ? 'subheadline' : undefined,
    }),
    classDate(plan),
    classTime(plan),
    divider('geometric'),
  ];

  // 用問句切段（問句 headline 是純結構，不對映 copy；下方的 painCopy 才是 copy 來源）
  const pain = painCopy(c, 'p');
  if (pain) {
    blocks.push(headline({ text: '你最近在煩什麼？', align: 'left', size: 'md' }));
    blocks.push(pain);
  }

  const sol = solutionCopy(c, 'p');
  if (sol) {
    blocks.push(headline({ text: '我們幫你準備好了！', align: 'left', size: 'md' }));
    blocks.push(sol);
  }

  blocks.push(divider('geometric'));

  if (plan.courses.length > 0) {
    blocks.push(headline({ text: '課程內容搶先看', align: 'left', size: 'md' }));
    blocks.push(courseTable(plan));
  }

  // whyForYou 改用「你會得到什麼」標題（vibrant variant）
  blocks.push(whyForYouCopy(c, 'vibrant'));

  // 上課方式 / 對象（純 plan 來源）
  blocks.push(buildAudienceCopy(plan));

  blocks.push(instructor(plan, '本班導師'));

  blocks.push(divider('geometric'));

  blocks.push(
    cta({
      label: c?.cta || '立刻加入！',
      url: plan.registrationUrl,
      // v0.7.4：高彩度活力 — 漸層按鈕（primary→accent）+ pill 圓角 + 中等陰影
      style: 'gradient',
      radius: 'pill',
      shadow: 'md',
      secondary: plan.syllabusUrl ? { label: '看完整課表', url: plan.syllabusUrl } : undefined,
      mirrorLabelToCopy: Boolean(c?.cta),
    }),
  );

  blocks.push(footer(buildFooterText(plan, '一起來學習吧！')));

  return compact<Block>(blocks);
}
