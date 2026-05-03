/**
 * Modern 模板 blueprint — 現代科技
 *
 * 敘事：「Tech briefing」風格。短句、左對齊、用三段式 headline 切版面節奏：
 *   The Problem → What You'll Build → Why Now
 *
 * 與 Classic 的差異：
 * - 上課時間 / 日期前置（資訊優先）
 * - 用 headline section title 切段落，而不是讓長段落硬擠在一起
 * - 沒有 footer divider（Modern 用 gradient-bar 收尾）
 * - 講師簡化，CTA 用英文 "Enroll Now"
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

export function buildModernBlueprint(ctx: BlueprintCtx): Block[] {
  const { plan, copy: c, heroImage } = ctx;

  const blocks: Array<Block | null> = [
    hero({
      image: heroImage,
      eyebrow: 'Tech Course',
      title: c?.headline || plan.title || '[班名]',
      subtitle: plan.classCode || '[班代號]',
      mirrorTitleToCopy: Boolean(c?.headline),
    }),
    // 資訊優先：時間/日期立刻顯示
    classDate(plan),
    classTime(plan),
  ];

  // v0.7.4：所有 section header 統一 weight 600（科技 briefing 風的中粗），
  // 但不加 effect — 5 個 section header 同時 fade-in 會太吵
  const sectionWeight = 600;

  // The Problem（pain）
  const pain = painCopy(c, 'p');
  if (pain) {
    blocks.push(headline({ text: 'The Problem', align: 'left', size: 'sm', weight: sectionWeight }));
    blocks.push(pain);
  }

  // What You'll Build（solution）
  const sol = solutionCopy(c, 'p');
  if (sol) {
    blocks.push(headline({ text: "What You'll Build", align: 'left', size: 'sm', weight: sectionWeight }));
    blocks.push(sol);
  }

  // 課程內容
  if (plan.courses.length > 0) {
    blocks.push(headline({ text: 'Course Modules', align: 'left', size: 'sm', weight: sectionWeight }));
    blocks.push(courseTable(plan));
  }

  // Why Now（whyForYou）
  const why = whyForYouCopy(c, 'modern');
  if (why) {
    blocks.push(headline({ text: 'Why Now', align: 'left', size: 'sm', weight: sectionWeight }));
    blocks.push(why);
  }

  // 上課方式 / 對象 / 預備知識
  const audience = buildAudienceCopy(plan);
  if (audience) {
    blocks.push(headline({ text: 'Logistics', align: 'left', size: 'sm', weight: sectionWeight }));
    blocks.push(audience);
  }

  blocks.push(instructor(plan));

  blocks.push(
    cta({
      label: c?.cta || 'Enroll Now →',
      url: plan.registrationUrl,
      // v0.7.4：科技感 — 大圓角 + 微微陰影，現代 SaaS 風格
      style: 'primary',
      radius: 'lg',
      shadow: 'sm',
      secondary: plan.syllabusUrl ? { label: 'View Syllabus', url: plan.syllabusUrl } : undefined,
      mirrorLabelToCopy: Boolean(c?.cta),
    }),
  );

  blocks.push(divider('geometric'));
  blocks.push(footer(buildFooterText(plan)));

  return compact<Block>(blocks);
}
