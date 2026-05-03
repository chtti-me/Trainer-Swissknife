/**
 * v0.7.0：「於輸入階段自動透過 AI 智慧生成文案與配圖」
 *
 * 由 SettingsDialog 的 `autoEnrichOnInput` 偏好控制（預設 false）。
 *
 * 此 helper 在使用者於「輸入」分頁完成解析（筆記 / 截圖 / HTML / 網址）後被觸發，
 * 接著做兩件事：
 *
 *   1. 呼叫 `generateCopy` 產生 1 組文案（沿用模板推薦語調），套到當前 EDM。
 *   2. 呼叫 `generateImage` 用模板推薦的視覺風格產生 hero 主視覺。
 *      若 AI 圖片失敗、且使用者設定了 Unsplash / Pexels Key，
 *      之後可以由 caller fallback 到圖庫（此處先不自動 fallback，避免擋住關鍵流程）。
 *
 * 設計重點：
 *   - 失敗單階不應擋住整個 enrich 流程，所以 copy 失敗就只跳過 copy，
 *     image 失敗就只跳過 image；最終 caller 會收到部分結果並依此決定 toast 文案。
 *   - 不直接寫入 store；僅回傳結果，由 caller（ClassPlanInput）負責套用，
 *     這樣未來想在背景 worker 跑這個流程也很容易（例如 Web Worker 或 server proxy）。
 */

import { generateCopy } from './generateCopy';
import { generateImage } from './generateImage';
import { recommendedToneFor } from './templateCopyProfile';
import { recommendedImageStyleFor } from './templateImageProfile';
import { hasGeminiKey } from './client';
import type { ClassPlan } from '@edm/types/classPlan';
import type { GeneratedCopy } from '@edm/types/copy';
import type { ImageStyle, ImageRatio } from './generateImage';

export interface AutoEnrichInput {
  plan: ClassPlan;
  templateId: string;
  /** 文案模型（沿用使用者在設定中選的） */
  preferredCopyModel: 'gemini-2.5-flash' | 'gemini-2.5-pro';
}

export interface AutoEnrichResult {
  /** 解析完接著生成的文案；失敗或未生成為 null */
  copy: GeneratedCopy | null;
  /** Hero 主視覺；source / metadata 一併回傳，方便 setHeroImage 寫入 */
  heroImage: {
    dataUrl: string;
    aiPrompt: string;
    aiStyle: ImageStyle;
    aiRatio: ImageRatio;
    aiWithText: boolean;
  } | null;
  /** 蒐集每階段錯誤訊息（給 toast 用，不丟 throw 中斷流程） */
  errors: { stage: 'copy' | 'image'; message: string }[];
}

const DEFAULT_RATIO: ImageRatio = '16:9';
const DEFAULT_WITH_TEXT = false;

export async function autoEnrichAfterParse(
  input: AutoEnrichInput,
): Promise<AutoEnrichResult> {
  const { plan, templateId, preferredCopyModel } = input;
  const result: AutoEnrichResult = { copy: null, heroImage: null, errors: [] };

  // 沒有 Gemini key 就完全不做（這個流程目前只走 Gemini，未來可擴 OpenAI / Claude）
  if (!hasGeminiKey()) {
    result.errors.push({ stage: 'copy', message: '尚未設定 Gemini API Key' });
    return result;
  }

  // 沒有 plan.title 就跳過（用 fallback 文案沒意義）
  if (!plan.title?.trim()) {
    result.errors.push({ stage: 'copy', message: 'plan.title 為空，跳過自動文案' });
    return result;
  }

  // 1) 文案
  try {
    const tone = recommendedToneFor(templateId);
    const versions = await generateCopy({
      plan,
      tone,
      versions: 1,
      model: preferredCopyModel,
      templateId,
    });
    result.copy = versions[0] ?? null;
  } catch (err) {
    result.errors.push({
      stage: 'copy',
      message: (err as Error).message ?? '文案生成失敗',
    });
  }

  // 2) Hero 圖
  try {
    const style = recommendedImageStyleFor(templateId);
    const aiPrompt = `一張代表「${plan.title}」課程主題的視覺，傳達學習與成長`;
    const img = await generateImage({
      prompt: aiPrompt,
      style,
      ratio: DEFAULT_RATIO,
      withText: DEFAULT_WITH_TEXT,
      templateId,
    });
    result.heroImage = {
      dataUrl: img.dataUrl,
      aiPrompt,
      aiStyle: style,
      aiRatio: DEFAULT_RATIO,
      aiWithText: DEFAULT_WITH_TEXT,
    };
  } catch (err) {
    result.errors.push({
      stage: 'image',
      message: (err as Error).message ?? 'AI 圖片生成失敗',
    });
  }

  return result;
}
