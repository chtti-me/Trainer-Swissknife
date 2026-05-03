import { getTemplateImageProfile } from './templateImageProfile';
import { getAiAdapter } from './registry';
import type { AiAdapter } from './adapter';
import { getHostConfig } from '@edm/store/hostConfigStore';

export type ImageStyle = 'photo' | 'illustration' | 'gradient' | 'isometric' | 'minimal' | 'tech';
export type ImageRatio = '16:9' | '4:3' | '1:1' | '3:4';

export const STYLE_LABELS: Record<ImageStyle, string> = {
  photo: '寫實攝影',
  illustration: '插畫風格',
  gradient: '漸層抽象',
  isometric: '等距 3D',
  minimal: '極簡幾何',
  tech: '未來科技',
};

const STYLE_PROMPTS: Record<ImageStyle, string> = {
  photo: 'high-quality professional editorial photography, soft cinematic lighting, depth of field',
  illustration: 'modern flat illustration with subtle gradients, clean composition',
  gradient: 'abstract gradient mesh background, smooth bokeh, modern brand aesthetic',
  isometric: 'isometric 3D illustration, clean color palette, slight shadow, marketing visual',
  minimal: 'minimal geometric composition, large negative space, single accent color',
  tech: 'futuristic tech aesthetic, neon accent lighting, holographic data visualisation',
};

export interface GenerateImageOpts {
  prompt: string;
  style: ImageStyle;
  ratio: ImageRatio;
  withText?: boolean;
  /**
   * 模板覺察：傳入 templateId 後會在 prompt 末尾追加該模板專屬的 visual cue
   * （lighting / palette / aesthetic），讓 hero 圖與選定模板的視覺氣質一致。
   */
  templateId?: string;
  /**
   * 額外的視覺指示，會 append 在模板 visual cue 之後、aspect ratio 之前。
   *
   * 整合用途：
   *   - 培訓師瑞士刀整合時，可注入 brand guideline / 院所視覺規範
   *   - 從外部資料源（例如 DB 中的活動主題色）動態加入色彩偏好
   *
   * 注意：保持指示簡短（< 200 字元）；過長 prompt 反而會稀釋核心要求。
   */
  extraImageInstructions?: string;
  /**
   * v0.5.0：可選注入自訂 AiAdapter；不傳就走全域 registry（預設 Gemini 瀏覽器直連）。
   */
  adapter?: AiAdapter;
}

export interface GeneratedImage {
  base64: string;
  mimeType: string;
  dataUrl: string;
}

/**
 * 組裝最終 prompt（測試用 / 給 verify 腳本檢驗 templateId 真的被 append 進去）
 */
export function buildImagePrompt(opts: GenerateImageOpts): string {
  const stylePart = STYLE_PROMPTS[opts.style];
  const tplPart = opts.templateId
    ? ` Template aesthetic: ${getTemplateImageProfile(opts.templateId).visualKeywords}.`
    : '';
  const extraPart = opts.extraImageInstructions?.trim()
    ? ` Additional: ${opts.extraImageInstructions.trim()}.`
    : '';
  return `${opts.prompt}. Style: ${stylePart}.${tplPart}${extraPart} Aspect ratio ${opts.ratio}. No watermark. No text in image unless explicitly requested.`;
}

/**
 * v0.5.0：走 AiAdapter；模型選擇與 Imagen → Gemini fallback 細節都封裝在 adapter 內部，
 * 上層只負責組 prompt + 指定 ratio / withText。
 */
export async function generateImage(opts: GenerateImageOpts): Promise<GeneratedImage> {
  const adapter = opts.adapter ?? getAiAdapter();
  // v0.5.2：caller 沒明確傳 extraImageInstructions 時，從 hostConfig 取
  const merged: GenerateImageOpts = {
    ...opts,
    extraImageInstructions:
      opts.extraImageInstructions ?? getHostConfig().extraImageInstructions,
  };
  const finalPrompt = buildImagePrompt(merged);

  const result = await adapter.generateImage({
    prompt: finalPrompt,
    ratio: merged.ratio,
    withText: merged.withText,
  });

  return {
    base64: result.base64,
    mimeType: result.mimeType,
    dataUrl: result.dataUrl,
  };
}
