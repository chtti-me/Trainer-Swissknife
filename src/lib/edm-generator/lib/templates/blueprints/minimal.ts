/**
 * Minimal 模板 blueprint — 簡潔留白
 *
 * 敘事：「靜止時刻」。極度克制：
 * - 移除所有 marketing 詞彙（不要「為什麼適合您」「本班為您準備」這類話術）
 * - 大量 divider 製造留白節奏
 * - copy 段落極短（單一段落即可，不堆疊四五段）
 * - CTA 用 outline / square 風格
 *
 * 與 Classic 最大差異：
 * - 沒有「為什麼適合您」分段
 * - solution 跟 pain 合成一段，避免兩段冗長
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
  hero,
  instructor,
  minimalLeadCopy,
} from '../helpers';

export function buildMinimalBlueprint(ctx: BlueprintCtx): Block[] {
  const { plan, copy: c, heroImage } = ctx;

  return compact<Block>([
    hero({
      image: heroImage,
      eyebrow: 'COURSE',
      title: c?.headline || plan.title || '[班名]',
      subtitle: plan.classCode || '[班代號]',
      mirrorTitleToCopy: Boolean(c?.headline),
    }),
    // 大留白
    divider('solid'),

    // pain + solution 合成單一極短段落（超過 2 句就太多）
    minimalLeadCopy(c),

    classDate(plan),
    classTime(plan),

    divider('solid'),

    // 純 plan 來源段落，不對映 copy；origin 預設為 blueprint
    plan.location ? copy(`<p>上課方式　${plan.location}</p>`) : null,
    plan.audience.length > 0 ? copy(`<p>適合對象　${plan.audience.join('、')}</p>`) : null,

    courseTable(plan),

    instructor(plan),

    cta({
      label: c?.cta || 'Enroll',
      url: plan.registrationUrl,
      // v0.7.4：極簡 — ghost 按鈕 + 小圓角，視覺上幾乎隱形
      style: 'ghost',
      radius: 'sm',
      mirrorLabelToCopy: Boolean(c?.cta),
    }),

    divider('solid'),
    footer(buildFooterText(plan, '')),
  ]);
}
