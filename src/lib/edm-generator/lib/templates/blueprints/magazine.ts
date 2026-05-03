/**
 * Magazine 模板 blueprint — 雜誌風
 *
 * 敘事：「策展刊物」。把 EDM 當作雜誌排版：
 * - 用「§01 / §02 / §03」章節編號分段（透過 headline.text 帶入符號，
 *   styles.ts 的 showSectionNumber 會自動套大型數字裝飾）
 * - 三個固定章節：「§01 課程章節」（課程表）、「§02 為什麼這堂課」、「§03 上課資訊」
 * - 每個章節之間用 serif-numeral divider（已在 styles.ts 配置）
 * - 開頭的 hero 使用 magazine variant（左圖右文 ghost-table，已 v0.2.1 完成）
 * - subheadline 變身為 pull-quote 大字引言
 * - 報名 CTA 用 outline / square 表達閱讀型刊物的克制感
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

export function buildMagazineBlueprint(ctx: BlueprintCtx): Block[] {
  const { plan, copy: c, heroImage } = ctx;

  const blocks: Array<Block | null> = [
    hero({
      image: heroImage,
      eyebrow: 'ISSUE · COURSE',
      title: c?.headline || plan.title || '[班名]',
      subtitle: plan.classCode || '[班代號]',
      mirrorTitleToCopy: Boolean(c?.headline),
    }),
    // 引言段（subheadline 大字）
    headline({
      text: c?.subheadline || '一場關於專業的對話',
      align: 'left',
      size: 'lg',
      // v0.7.4：雜誌厚重襯線感 — 字重拉到 800，呼應 magazine palette 的 serif headline 樣式
      weight: 800,
      mirrorTextToCopy: c?.subheadline ? 'subheadline' : undefined,
    }),
  ];

  // pain 作為前言（雜誌的 lead paragraph，用 em 變體）
  blocks.push(painCopy(c, 'em'));

  blocks.push(divider('solid'));

  // §01 課程章節
  if (plan.courses.length > 0) {
    blocks.push(headline({ text: '§01　課程章節', align: 'left', size: 'md' }));
    blocks.push(courseTable(plan));
  }

  // §02 為什麼這堂課
  if (c?.solution || c?.whyForYou?.length) {
    blocks.push(divider('solid'));
    blocks.push(headline({ text: '§02　為什麼這堂課', align: 'left', size: 'md' }));
    blocks.push(solutionCopy(c, 'p'));
    blocks.push(whyForYouCopy(c, 'magazine'));
  }

  // §03 上課資訊（純 plan 來源段落）
  blocks.push(divider('solid'));
  blocks.push(headline({ text: '§03　上課資訊', align: 'left', size: 'md' }));
  blocks.push(classDate(plan));
  blocks.push(classTime(plan));
  if (plan.location) blocks.push(copy(`<p><strong>上課方式　</strong>${plan.location}</p>`));
  if (plan.audience.length > 0) {
    blocks.push(copy(`<p><strong>適合對象　</strong>${plan.audience.join('、')}</p>`));
  }
  if (plan.prerequisites) blocks.push(copy(`<p><strong>預備知識　</strong>${plan.prerequisites}</p>`));

  blocks.push(instructor(plan, '本期主編'));

  blocks.push(divider('solid'));

  blocks.push(
    cta({
      label: c?.cta || '閱讀完整課程簡介',
      url: plan.registrationUrl,
      // v0.7.4：刊物式克制 — outline + square 角、無陰影，呼應 magazine 的方正版面節奏
      style: 'outline',
      radius: 'square',
      shadow: 'none',
      secondary: plan.syllabusUrl ? { label: '訂閱本刊', url: plan.syllabusUrl } : undefined,
      mirrorLabelToCopy: Boolean(c?.cta),
    }),
  );

  blocks.push(footer(buildFooterText(plan, '本期完。')));

  return compact<Block>(blocks);
}
