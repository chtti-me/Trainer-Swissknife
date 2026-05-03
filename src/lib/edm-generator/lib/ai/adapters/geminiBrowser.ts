/**
 * v0.5.0：GeminiBrowserAdapter —— 預設 AiAdapter 實作。
 *
 * 把原本散落在 `client.ts` / `generateCopy.ts` / `generateImage.ts` /
 * `parseClassPlan.ts` / `autoLayout.ts` 中對 `@google/genai` 的直接呼叫，
 * 全部集中到這裡。對外只暴露 `AiAdapter` 介面。
 *
 * 行為：
 *   - API Key 從 `useSettingsStore.geminiApiKey` 讀取（已存在 v0.4.x）
 *   - 沒 key 時 throw `AiAdapterNotReadyError('no-api-key', ...)`
 *   - cached client：避免每次呼叫都 new GoogleGenAI（key 變更才重建）
 *   - schema 翻譯：把我們的 `AiJsonSchema`（小寫 type）翻譯成 Gemini 的 `Type` enum
 *   - generateImage：保留 v0.3 行為 —— withText 用 `gemini-2.5-flash-image`，
 *     否則先試 `imagen-4.0-generate-001`，失敗再 fallback `gemini-2.5-flash-image`
 */

import { GoogleGenAI, Type } from '@google/genai';
import { useSettingsStore } from '@edm/store/settingsStore';
import {
  AiAdapterNotReadyError,
  type AiAdapter,
  type AiGenerateImageOpts,
  type AiGenerateImageResult,
  type AiGenerateTextOpts,
  type AiGenerateTextResult,
  type AiJsonSchema,
  type AiUserPart,
} from '../adapter';

let cached: { key: string; client: GoogleGenAI } | null = null;

function getClient(): GoogleGenAI {
  const key = useSettingsStore.getState().geminiApiKey;
  if (!key) {
    throw new AiAdapterNotReadyError(
      'no-api-key',
      '尚未設定 Gemini API Key，請在 .env 填入 GEMINI_API_KEY 並重啟伺服器。',
    );
  }
  if (!cached || cached.key !== key) {
    cached = { key, client: new GoogleGenAI({ apiKey: key }) };
  }
  return cached.client;
}

/** 強制 reset cache（給測試或使用者手動「重新登入」用，目前未對外暴露） */
export function _resetGeminiClientCache(): void {
  cached = null;
}

/**
 * 把我們抽象的 `AiJsonSchema`（小寫字串 type）翻譯成 Gemini SDK 用的 schema
 * （`type` 為 `Type.OBJECT` 等大寫 enum）。
 *
 * Gemini SDK 雖然偶爾接受小寫 / 大寫字串，但 `Type` enum 是官方推薦寫法，
 * 走翻譯函式可避免某些 build 環境下 enum 字面量被當成未知值。
 */
export function aiSchemaToGemini(schema: AiJsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  out.type = schemaTypeToGemini(schema.type);
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = schema.enum;
  if (schema.properties) {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      props[k] = aiSchemaToGemini(v);
    }
    out.properties = props;
  }
  if (schema.required) out.required = schema.required;
  if (schema.items) out.items = aiSchemaToGemini(schema.items);
  return out;
}

function schemaTypeToGemini(t: AiJsonSchema['type']): unknown {
  switch (t) {
    case 'object':
      return Type.OBJECT;
    case 'array':
      return Type.ARRAY;
    case 'string':
      return Type.STRING;
    case 'number':
      return Type.NUMBER;
    case 'integer':
      return Type.INTEGER;
    case 'boolean':
      return Type.BOOLEAN;
    default:
      return Type.STRING;
  }
}

function userToGeminiParts(user: string | AiUserPart[]): Array<Record<string, unknown>> {
  if (typeof user === 'string') {
    return [{ text: user }];
  }
  return user.map((p) => {
    if (p.kind === 'text') return { text: p.text };
    return { inlineData: { mimeType: p.mimeType, data: p.base64 } };
  });
}

export class GeminiBrowserAdapter implements AiAdapter {
  describe(): { name: string; requiresApiKey: boolean } {
    return { name: 'Gemini（瀏覽器直連）', requiresApiKey: true };
  }

  async generateText(opts: AiGenerateTextOpts): Promise<AiGenerateTextResult> {
    const client = getClient();
    const model = opts.model ?? 'gemini-2.5-flash';

    const config: Record<string, unknown> = {};
    if (opts.systemInstruction) config.systemInstruction = opts.systemInstruction;
    if (opts.responseSchema) {
      config.responseMimeType = 'application/json';
      config.responseSchema = aiSchemaToGemini(opts.responseSchema);
    }
    if (typeof opts.temperature === 'number') {
      config.temperature = opts.temperature;
    }

    const res = await client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: userToGeminiParts(opts.user) }],
      config: config as never,
    });

    return { text: res.text ?? '', model };
  }

  async generateImage(opts: AiGenerateImageOpts): Promise<AiGenerateImageResult> {
    const client = getClient();

    // 規則：要求圖內含文字 → 直接走 gemini-2.5-flash-image
    //       不需文字 → 先試 imagen-4.0-generate-001（畫質較好），失敗 fallback
    const preferredModel = opts.withText ? 'gemini-2.5-flash-image' : 'imagen-4.0-generate-001';

    if (preferredModel === 'imagen-4.0-generate-001') {
      try {
        const res = await client.models.generateImages({
          model: preferredModel,
          prompt: opts.prompt,
          config: { numberOfImages: 1, aspectRatio: opts.ratio },
        });
        const img = res.generatedImages?.[0]?.image;
        if (!img?.imageBytes) throw new Error('Imagen 未回傳圖片');
        const mimeType = img.mimeType ?? 'image/png';
        return {
          base64: img.imageBytes,
          mimeType,
          dataUrl: `data:${mimeType};base64,${img.imageBytes}`,
          model: preferredModel,
        };
      } catch (err) {
        console.warn('Imagen failed, falling back to gemini-2.5-flash-image:', err);
      }
    }

    const fallbackModel = 'gemini-2.5-flash-image';
    const res = await client.models.generateContent({
      model: fallbackModel,
      contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
    });
    const cand = res.candidates?.[0];
    const inlineData = cand?.content?.parts?.find(
      (p) => 'inlineData' in p && p.inlineData?.data,
    )?.inlineData;
    if (!inlineData?.data) {
      throw new Error('生圖模型未回傳圖片，請稍後再試或調整提示詞。');
    }
    const mimeType = inlineData.mimeType ?? 'image/png';
    return {
      base64: inlineData.data,
      mimeType,
      dataUrl: `data:${mimeType};base64,${inlineData.data}`,
      model: fallbackModel,
    };
  }
}
