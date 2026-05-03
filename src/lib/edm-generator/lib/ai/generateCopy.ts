import type { ClassPlan } from '@edm/types/classPlan';
import type { GeneratedCopy } from '@edm/types/copy';
import { TONE_HINTS, TONE_LABELS, type CopyTone } from '@edm/types/copy';
import { getTemplateCopyProfile } from './templateCopyProfile';
import { getAiAdapter } from './registry';
import type { AiAdapter, AiJsonSchema } from './adapter';
import { getHostConfig } from '@edm/store/hostConfigStore';

/**
 * v0.5.0：把直接呼叫 `@google/genai` 的部分抽到 `AiAdapter`。
 *
 * 對外 signature 不變（caller 不用改），多了一個選填的 `adapter` 參數，
 * 給未來瑞士刀整合用：
 *
 *   generateCopy({ ..., adapter: trainerAcademyServerAdapter })
 *
 * 沒傳就走 `getAiAdapter()` 的全域注入點（預設 GeminiBrowserAdapter）。
 *
 * 同時把 schema 從 Gemini 特有的 `Type.OBJECT` enum 改成 framework-agnostic 的
 * `AiJsonSchema`（小寫 type 字串），由 adapter 內部翻譯成各家形式。
 */
const RESPONSE_SCHEMA: AiJsonSchema = {
  type: 'object',
  properties: {
    versions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          headline: { type: 'string', description: '14 字內，吸睛主標' },
          subheadline: { type: 'string', description: '20 字內，補充情境的副標' },
          pain: { type: 'string', description: '50 字內，描述目標學員的真實痛點或缺口' },
          solution: { type: 'string', description: '60 字內，本班如何解決上述痛點' },
          whyForYou: {
            type: 'array',
            items: { type: 'string' },
            description: '3 條，每條 25 字內，用「您將...」、「適合您...」起頭',
          },
          cta: { type: 'string', description: '8 字內的行動呼籲，例如：立即報名 / 我要參加' },
        },
        required: ['headline', 'subheadline', 'pain', 'solution', 'whyForYou', 'cta'],
      },
    },
  },
  required: ['versions'],
};

export interface GenerateCopyOpts {
  plan: ClassPlan;
  tone: CopyTone;
  customPrompt?: string;
  model?: 'gemini-2.5-flash' | 'gemini-2.5-pro';
  versions?: number;
  /**
   * 模板覺察（template-aware）：傳入後，AI 會收到該模板專屬的寫作風格指示，
   * 確保產出文字風格與選定模板的視覺氣質一致。
   * 找不到 templateId 時 fallback 到 classic profile。
   */
  templateId?: string;
  /**
   * 額外的 system instructions，會 append 在主 system prompt 與模板 profile 之後、
   * 但仍在「只回傳 JSON」指令之前。
   *
   * 整合用途：
   *   - 培訓師瑞士刀整合時，注入「AI 技能脈絡（全院 + 個人）」
   *     由 `buildAiSkillPromptAppend(userId)` 產出
   *   - 任何宿主應用想加入規則 / 客製化指引（不影響 schema）
   *
   * 不要透過這個欄位改變 JSON schema，請改 RESPONSE_SCHEMA。
   */
  extraSystemInstructions?: string;
  /**
   * v0.5.0：可選注入自訂 AiAdapter；不傳就走全域 registry（預設 Gemini 瀏覽器直連）。
   *
   * 整合場景：瑞士刀 server-side render 時可以在這裡傳入 server-proxy 版本的 adapter，
   * 讓 API key 留在 server，client 永遠看不到。
   */
  adapter?: AiAdapter;
}

const totalHours = (plan: ClassPlan): number =>
  plan.totalHours || plan.courses.reduce((acc, c) => acc + (c.hours || 0), 0);

export function buildSystemPrompt(
  tone: CopyTone,
  templateId?: string,
  extraSystemInstructions?: string,
): string {
  const profile = templateId ? getTemplateCopyProfile(templateId) : null;

  const baseRequirements = `你是中華電信學院的 EDM 文案專家，目標讀者是中華電信內部員工（包含工程師、行政、業務、研究員等）。

語調：${TONE_LABELS[tone]} —— ${TONE_HINTS[tone]}

寫作要求：
1. 全部繁體中文，禁止簡體字。
2. 不要使用 emoji，標題與內文不要驚嘆號泛濫，避免廉價感。
3. 文案要具體連結到課程實際內容，避免空洞口號。
4. 「為什麼適合您」三點要從學員視角出發、講具體職場好處。
5. 嚴格遵守每段字數上限。`;

  const templateBlock = profile
    ? `\n\n本次選定的視覺模板：${profile.label}\n${profile.promptInstruction}\n\n請務必讓「文字風格」與「視覺模板」一致，否則排出來的 EDM 會看起來格格不入。`
    : '';

  // 宿主應用注入的額外規則（例如瑞士刀的「AI 技能脈絡」）
  const extraBlock = extraSystemInstructions?.trim()
    ? `\n\n[宿主規則 / Host Rules]\n${extraSystemInstructions.trim()}`
    : '';

  return `${baseRequirements}${templateBlock}${extraBlock}\n\n只回傳 JSON，符合 schema。`;
}

export async function generateCopy(opts: GenerateCopyOpts): Promise<GeneratedCopy[]> {
  const { plan, tone, customPrompt, versions = 3, templateId } = opts;
  const adapter = opts.adapter ?? getAiAdapter();
  const model = opts.model ?? 'gemini-2.5-flash';

  // v0.5.2：caller 沒明確傳 extraSystemInstructions 時，從 hostConfig 取
  // （兩者都有時，caller 傳的優先 —— 因為 caller 顯然是更近的決策點）。
  const extraSystemInstructions =
    opts.extraSystemInstructions ?? getHostConfig().extraSystemInstructions;

  const courseList = plan.courses.map((c) => `${c.name}（${c.hours} 小時，主講：${c.instructor || '—'}）`).join('；');
  const briefing = [
    `班代號：${plan.classCode}`,
    `主題：${plan.title}`,
    `總時數：${totalHours(plan)} 小時`,
    `上課日期：${plan.classDays.join('、') || plan.startDate}`,
    `上課時間：${plan.startTime}-${plan.endTime}`,
    `上課方式：${plan.location}`,
    `課程內容：${courseList || '（未提供）'}`,
    `學習目標：${plan.objectives.join('；') || '（未提供）'}`,
    `目標對象：${plan.audience.join('；') || '（未提供）'}`,
    `預備知識：${plan.prerequisites || '（未提供）'}`,
    `導師：${plan.mentor.name}`,
  ].join('\n');

  const userPrompt = `請依下列開班資訊，產出 ${versions} 組可用於 EDM 的文案版本：\n\n${briefing}\n\n${
    customPrompt ? `額外指示：${customPrompt}` : ''
  }`;

  const result = await adapter.generateText({
    systemInstruction: buildSystemPrompt(tone, templateId, extraSystemInstructions),
    user: userPrompt,
    responseSchema: RESPONSE_SCHEMA,
    model,
    temperature: 0.95,
  });

  let parsed: { versions: GeneratedCopy[] };
  try {
    parsed = JSON.parse(result.text);
  } catch {
    throw new Error('文案 AI 回傳格式錯誤：' + result.text.slice(0, 200));
  }
  return parsed.versions ?? [];
}
