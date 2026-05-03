import { classPlanSchema, emptyClassPlan, type ClassPlan } from '@edm/types/classPlan';
import { getAiAdapter } from './registry';
import type { AiAdapter, AiJsonSchema, AiUserPart } from './adapter';

const MODEL = 'gemini-2.5-flash';

const RESPONSE_SCHEMA: AiJsonSchema = {
  type: 'object',
  properties: {
    classCode: { type: 'string', description: '班代號，例如 CR25AP003' },
    title: { type: 'string', description: '主題 / 班名' },
    termNumber: { type: 'string', description: '期數' },
    startDate: { type: 'string', description: '起始上課日，原文格式即可' },
    endDate: { type: 'string', description: '結束日（可空）' },
    classDays: {
      type: 'array',
      items: { type: 'string' },
      description:
        '所有上課日清單，逐筆條列；每一筆務必使用西元年的 ISO 格式 YYYY-MM-DD，例如 2026-05-06。若原文是民國年 115/05/06 或「115年 05/06」，請自行加 1911 換算成 2026-05-06。',
    },
    startTime: { type: 'string', description: '上課開始時間，例如 09:30' },
    endTime: { type: 'string', description: '上課結束時間，例如 11:30' },
    totalHours: { type: 'number', description: '總時數' },
    location: { type: 'string', description: '上課地點或方式（線上/實體）' },
    audience: {
      type: 'array',
      items: { type: 'string' },
      description: '目標對象條列',
    },
    prerequisites: { type: 'string', description: '預備知識' },
    objectives: {
      type: 'array',
      items: { type: 'string' },
      description: '學習目標條列',
    },
    mentor: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '導師（培訓師）姓名' },
        phone: { type: 'string' },
        email: { type: 'string' },
      },
    },
    courses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          name: { type: 'string' },
          hours: { type: 'number' },
          instructor: { type: 'string', description: '主講人 / 講師' },
        },
        required: ['name'],
      },
    },
    registrationUrl: { type: 'string' },
    syllabusUrl: { type: 'string' },
  },
  required: ['title'],
};

const SYSTEM_PROMPT = `你是中華電信學院的資料解析助理，負責從「開班計畫表」抽取學員報名 EDM 所需的欄位。

請特別注意以下原則：
1. 只擷取會出現在 EDM 上、學員會關心的內容（班名、課程、日期、時間、講師、導師、目標對象、預備知識、學習目標等）。
2. 「體系別、績效、預調人數、調訓單位、案由、案由說明、教學網提供錄影、佐證資料、教室、培訓構面、轉型課程類別、考證輔導班、ESG 分類、領域分類、報到地點、報到時間、結訓時間」等內部欄位請忽略。
3. 課程列表（courses）通常有多筆，需逐筆條列；hours 是純數字。
4. 若某欄位無法判讀，回傳空字串、空陣列或 0，禁止幻覺。
5. 講師（instructor）通常出現在課程列表的「主講人」或「主持人」欄；導師（mentor）通常出現在頂部「導師」、「培訓師」欄。
6. 上課日期 classDays：請一律輸出西元年的 ISO 格式 YYYY-MM-DD（例：2026-05-06）。原文若是民國年（115/05/06、115年5月6日），務必先加 1911 換算成西元年再輸出，禁止輸出含「年」字或民國年字樣。
7. 全部回傳繁體中文。

只輸出 JSON，符合提供的 schema。`;

export type ParseInput =
  | { kind: 'text'; text: string }
  | { kind: 'html'; html: string }
  | { kind: 'image'; mimeType: string; base64: string };

export interface ParseClassPlanOpts {
  /** v0.5.0：可選注入自訂 AiAdapter；不傳走全域 registry */
  adapter?: AiAdapter;
}

export async function parseClassPlan(
  input: ParseInput,
  opts: ParseClassPlanOpts = {},
): Promise<ClassPlan> {
  const adapter = opts.adapter ?? getAiAdapter();

  const parts: AiUserPart[] = [];

  if (input.kind === 'text') {
    parts.push({ kind: 'text', text: `請解析下列文字筆記內容，抽取為 JSON：\n\n${input.text}` });
  } else if (input.kind === 'html') {
    const cleaned = stripHtml(input.html);
    parts.push({
      kind: 'text',
      text: `請解析下列開班計畫表 HTML 內容（已移除多餘標籤），抽取為 JSON：\n\n${cleaned}`,
    });
  } else {
    parts.push({ kind: 'text', text: '請解析下列開班計畫表截圖內容，抽取為 JSON。' });
    parts.push({ kind: 'image', mimeType: input.mimeType, base64: input.base64 });
  }

  const result = await adapter.generateText({
    systemInstruction: SYSTEM_PROMPT,
    user: parts,
    responseSchema: RESPONSE_SCHEMA,
    model: MODEL,
    temperature: 0.1,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.text);
  } catch {
    throw new Error('AI 回傳的不是合法 JSON：' + result.text.slice(0, 200));
  }

  const merged = { ...emptyClassPlan(), ...(parsed as Record<string, unknown>) };
  const validated = classPlanSchema.safeParse(merged);
  if (!validated.success) {
    console.warn('Schema validation issues, using merged result:', validated.error);
    return merged as ClassPlan;
  }
  return validated.data;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .slice(0, 30000)
    .trim();
}
