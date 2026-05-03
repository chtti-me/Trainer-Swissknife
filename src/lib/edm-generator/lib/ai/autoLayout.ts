import type { ClassPlan } from '@edm/types/classPlan';
import type { GeneratedCopy } from '@edm/types/copy';
import { TEMPLATES } from '@edm/lib/templates';
import { PALETTE_PRESETS } from '@edm/lib/palettes/presets';
import { getAiAdapter } from './registry';
import type { AiAdapter, AiJsonSchema } from './adapter';

const RESPONSE_SCHEMA: AiJsonSchema = {
  type: 'object',
  properties: {
    templateId: { type: 'string', description: '從給定的模板中挑一個 id' },
    paletteId: { type: 'string', description: '從給定的配色方案挑一個 id' },
    rationale: { type: 'string', description: '一句話說明為何這樣選' },
  },
  required: ['templateId', 'paletteId'],
};

export interface AutoLayoutChoice {
  templateId: string;
  paletteId: string;
  rationale: string;
}

export interface AutoLayoutOpts {
  /** v0.5.0：可選注入自訂 AiAdapter；不傳走全域 registry */
  adapter?: AiAdapter;
}

export async function autoLayout(
  plan: ClassPlan,
  copy: GeneratedCopy | null,
  opts: AutoLayoutOpts = {},
): Promise<AutoLayoutChoice> {
  const adapter = opts.adapter ?? getAiAdapter();
  const templates = TEMPLATES.map((t) => `- id=${t.id} 名稱=${t.name} 適合=${t.description}`).join('\n');
  const palettes = PALETTE_PRESETS.map((p) => `- id=${p.id} 名稱=${p.name} 描述=${p.description}`).join('\n');

  const briefing = `班代號：${plan.classCode}\n主題：${plan.title}\n總時數：${plan.totalHours}\n課程：${plan.courses
    .map((c) => c.name)
    .join('、')}\n目標對象：${plan.audience.join('；')}\n文案語感：${copy?.headline ?? '（尚未生成）'}`;

  const userPrompt = `你是 EDM 視覺顧問，請依下列開班內容，從給定的模板與配色方案中各挑一個最佳組合：\n\n模板選項：\n${templates}\n\n配色選項：\n${palettes}\n\n開班資訊：\n${briefing}`;

  const result = await adapter.generateText({
    user: userPrompt,
    responseSchema: RESPONSE_SCHEMA,
    model: 'gemini-2.5-flash',
    temperature: 0.4,
  });

  let parsed: AutoLayoutChoice;
  try {
    parsed = JSON.parse(result.text || '{}');
  } catch {
    throw new Error('AI 排版回傳格式錯誤');
  }
  const validTemplate = TEMPLATES.some((t) => t.id === parsed.templateId);
  const validPalette = PALETTE_PRESETS.some((p) => p.id === parsed.paletteId);
  return {
    templateId: validTemplate ? parsed.templateId : 'classic',
    paletteId: validPalette ? parsed.paletteId : 'cht-brand',
    rationale: parsed.rationale ?? '',
  };
}
