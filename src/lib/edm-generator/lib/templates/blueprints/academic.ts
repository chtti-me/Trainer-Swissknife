/**
 * Academic 模板 blueprint — 學術正式
 *
 * 敘事：「公文 / 開班通知」風格。最像企業內部既有 EDM。
 * - 用「壹、貳、參、肆」中文數字標題分段（不用阿拉伯數字，符合公文體例）
 * - 開頭有「主旨」「說明」公文式段落
 * - 課程表前置（按公文格式：先講主旨、再講細節）
 * - footer 使用「formal」style，加上正式署名
 */

import type { Block } from '@edm/types/blocks';
import {
  type BlueprintCtx,
  academicPainSolutionCopy,
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
  totalHoursOf,
  whyForYouCopy,
} from '../helpers';

export function buildAcademicBlueprint(ctx: BlueprintCtx): Block[] {
  const { plan, copy: c, heroImage } = ctx;

  const blocks: Array<Block | null> = [
    hero({
      image: heroImage,
      eyebrow: '公告 NOTICE',
      title: c?.headline || plan.title || '[班名]',
      subtitle: plan.classCode || '[班代號]',
      mirrorTitleToCopy: Boolean(c?.headline),
    }),
  ];

  // 公文式「主旨」段（subheadline 不直接 mirror，因為前後有「主旨：」前綴會干擾，
  // 但仍標記 origin: blueprint，partial update 時不動，使用者會覺得這段是固定殼）
  const subjectText = c?.subheadline || `茲訂於下列日期辦理「${plan.title || '本班'}」研習，敬請踴躍報名參加。`;
  blocks.push(copy(`<p><strong>主旨：</strong>${subjectText}</p>`));

  // 公文式「說明」段（合併 pain + solution）→ 用 typed helper
  blocks.push(academicPainSolutionCopy(c));

  // 壹、課程資訊
  blocks.push(divider('solid'));
  blocks.push(headline({ text: '壹、課程資訊', align: 'center', size: 'sm' }));
  if (plan.courses.length > 0) {
    blocks.push(courseTable(plan));
  }
  if ((plan.totalHours || totalHoursOf(plan)) > 0) {
    blocks.push(copy(`<p>合計時數：<strong>${plan.totalHours || totalHoursOf(plan)} 小時</strong></p>`));
  }

  // 貳、上課時間／地點
  blocks.push(headline({ text: '貳、上課時間與地點', align: 'center', size: 'sm' }));
  blocks.push(classDate(plan));
  blocks.push(classTime(plan));
  if (plan.location) blocks.push(copy(`<p><strong>上課方式：</strong>${plan.location}</p>`));

  // 參、適合對象
  if (plan.audience.length > 0 || plan.prerequisites) {
    blocks.push(headline({ text: '參、適合對象與預備知識', align: 'center', size: 'sm' }));
    if (plan.audience.length > 0) {
      blocks.push(
        copy(`<p><strong>適合對象：</strong></p><ul>${plan.audience.map((a) => `<li>${a}</li>`).join('')}</ul>`),
      );
    }
    if (plan.prerequisites) blocks.push(copy(`<p><strong>預備知識：</strong>${plan.prerequisites}</p>`));
  }

  // 肆、聯絡資訊
  blocks.push(headline({ text: '肆、聯絡資訊', align: 'center', size: 'sm' }));
  blocks.push(instructor(plan, '承辦人'));
  // 學術版「為什麼適合您」改稱「研習效益」（用 typed helper）
  blocks.push(whyForYouCopy(c, 'academic'));

  blocks.push(divider('solid'));

  blocks.push(
    cta({
      label: c?.cta || '前往報名',
      url: plan.registrationUrl,
      // v0.7.4：公文方正 — 直角 + 無陰影，呼應壹貳參肆的中文公文體例
      style: 'primary',
      radius: 'square',
      shadow: 'none',
      secondary: plan.syllabusUrl ? { label: '下載開班計畫表', url: plan.syllabusUrl } : undefined,
      mirrorLabelToCopy: Boolean(c?.cta),
    }),
  );

  // 公文式署名 footer
  const signoff = `中華電信學院　資訊學系${plan.mentor.name ? `　${plan.mentor.name}` : ''}　敬啟`;
  blocks.push(footer(signoff));

  return compact<Block>(blocks);
}
