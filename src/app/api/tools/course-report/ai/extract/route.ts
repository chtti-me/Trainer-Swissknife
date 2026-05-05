/**
 * 【課程規劃報告產生器 - AI 抽取結構化報告】
 *
 * POST /api/tools/course-report/ai/extract
 *   Body: {
 *     userTitle?: string;       // 使用者初步輸入的「主題提示」（會 prepend 到 prompt）
 *     userNotes?: string;       // 使用者貼的純文字筆記
 *     parsedTexts?: Array<{ filename: string; text: string }>; // 已 parse-uploads 的檔案
 *     fetchedUrl?: { url: string; title?: string; text: string }; // 已 fetch-url 的網頁
 *     images?: Array<{ filename: string; mimeType: string; base64: string }>; // 圖片（base64）
 *     reporter?: string;        // 報告人
 *     department?: string;      // 學系
 *     overwriteAll?: boolean;   // 是否覆蓋所有欄位（前端決定）
 *   }
 *
 *   回傳 AiExtractedReport JSON（title / purpose / designSummary / sessions / benefits / notes）
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildAiSkillPromptAppend } from "@/lib/ai-skills";
import { generateAiText, safeJsonParse } from "../../_lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_INSTRUCTION = `你是中華電信學院培訓師的「課程規劃報告產生器」AI 助手。

你的任務：
從使用者上傳的「開班計畫表、課程資料、文字筆記、TIS 網頁、截圖」等資料中，
萃取結構化資訊，協助培訓師對其直屬主管（學系主任、副院長、院長）撰寫
「課程或一系列課程的規劃／成果報告」。

報告應包含以下欄位（你會以 JSON 回傳）：
- title：報告大標題（通常是課程名稱或系列名稱）。長度建議 12–30 字。
- purpose：「案由與目的」。為什麼要規劃這個課程？目標是什麼？要解決什麼問題？通常可從開班計畫表或案由欄位整理。寫成 1–3 段、共 100–300 字。
- designSummary：「課程規劃」的開場簡述。介紹本系列課程的整體安排（節數、對象、時程概念），1 段 60–150 字。
- sessions：節次表格（陣列）。每個 session 代表一節課程，欄位：
   - date：日期，**必須**輸出 ISO 格式 "YYYY-MM-DD"（例 "2026-05-12"），不要用斜線、不要用相對日期
   - timeRange：時間範圍，**必須**輸出 "HH:MM–HH:MM" 格式（24 小時制，破折號用 U+2013 或 -），例 "09:00–12:00"
   - topic：課程主題
   - instructor：講師姓名（多人請用「、」分隔）
   - highlights：亮點（可幫公司提升效率、改善品質、節省金錢、提高營收、有高階長官蒞臨指導…）多用具體數字、效益動詞，避免空泛
   - hours：時數（純數字字串，例 "3"）
- benefits：預期效益（陣列）。每項一句話，要求：
   - 對公司：可幫公司提升 X 效率 / 節省 Y 工時 / 提高 Z 業務能力 / 改善 W 品質
   - 對學員：可學到、能應用於工作 ○○
   - 思考層面要寬：除了使用者已提到的，再「發掘潛藏亮點 + 發想可能可發揮的其他亮點」共 3–6 項
- notes：你的補充說明（陣列各項用「\\n- 」分隔）。包括：哪些欄位資料不足、你做了什麼推測、建議使用者再補哪些資料。

撰寫風格：
- 正式、精簡、條理清晰，符合中華電信學院公務報告語氣
- 使用「我們、本院、本學系」第一人稱
- 不要捏造未在資料中出現的具體數字、姓名、組織單位
- 若資料完全缺乏某欄位，留空字串或空陣列即可，不要硬塞`;

// json_schema：給 OpenAI strict 模式用
const RESPONSE_SCHEMA = {
  type: "object" as const,
  properties: {
    title: { type: "string" },
    purpose: { type: "string" },
    designSummary: { type: "string" },
    sessions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string" },
          timeRange: { type: "string" },
          topic: { type: "string" },
          instructor: { type: "string" },
          highlights: { type: "string" },
          hours: { type: "string" },
        },
      },
    },
    benefits: {
      type: "array",
      items: { type: "string" },
    },
    notes: { type: "string" },
  },
};

interface ExtractRequest {
  userTitle?: string;
  userNotes?: string;
  parsedTexts?: Array<{ filename: string; text: string }>;
  fetchedUrl?: { url: string; title?: string; text: string };
  images?: Array<{ filename: string; mimeType: string; base64: string }>;
  reporter?: string;
  department?: string;
  overwriteAll?: boolean;
}

interface ExtractResponse {
  title?: string;
  purpose?: string;
  designSummary?: string;
  sessions?: Array<Record<string, string>>;
  benefits?: string[];
  notes?: string;
}

function trimToMax(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "\n\n…（已省略 " + (s.length - max) + " 字以節省 token）";
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }
  const userId = (session.user as { id?: string }).id || "";

  let body: ExtractRequest;
  try {
    body = (await req.json()) as ExtractRequest;
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  // 組 user message
  const segments: string[] = [];

  if (body.userTitle) {
    segments.push(`【使用者標題提示】\n${body.userTitle}`);
  }
  if (body.reporter) segments.push(`【報告人】${body.reporter}`);
  if (body.department) segments.push(`【學系】${body.department}`);
  if (body.userNotes) {
    segments.push(`【使用者文字筆記】\n${trimToMax(body.userNotes, 5000)}`);
  }
  if (body.fetchedUrl) {
    segments.push(
      `【自網址抓取的內容】URL：${body.fetchedUrl.url}${
        body.fetchedUrl.title ? `\n網頁標題：${body.fetchedUrl.title}` : ""
      }\n--- 內容 ---\n${trimToMax(body.fetchedUrl.text, 8000)}`
    );
  }
  if (body.parsedTexts && body.parsedTexts.length > 0) {
    body.parsedTexts.forEach((p, i) => {
      segments.push(
        `【上傳檔案 ${i + 1}：${p.filename}】\n${trimToMax(p.text, 6000)}`
      );
    });
  }

  segments.push(
    `\n請依照系統指示，將以上資料整理為 JSON 格式的課程規劃報告。`
  );

  const userMessage: Array<
    { kind: "text"; text: string } | { kind: "image"; mimeType: string; base64: string }
  > = [{ kind: "text", text: segments.join("\n\n") }];

  // 圖片走多模態：把每張圖以 image_url 帶入
  if (body.images && body.images.length > 0) {
    for (const img of body.images.slice(0, 6)) {
      userMessage.push({
        kind: "image",
        mimeType: img.mimeType || "image/png",
        base64: img.base64,
      });
    }
    userMessage.push({
      kind: "text",
      text: "（以上圖片是使用者上傳的截圖，可能是開班計畫表、課程介紹、講師資料等，請一併閱讀並萃取內容）",
    });
  }

  // 注入 AI 技能脈絡
  let skillsAppend = "";
  if (userId) {
    try {
      skillsAppend = await buildAiSkillPromptAppend(userId, {
        includeSlugs: ["course_planning", "instructor_search", "classroom", "schedule"],
        includeSlugPrefixes: ["planning_"],
      });
    } catch (err) {
      console.warn("[course-report ai/extract] buildAiSkillPromptAppend 失敗：", err);
    }
  }

  const systemInstruction = skillsAppend
    ? `${SYSTEM_INSTRUCTION}\n\n${skillsAppend}`
    : SYSTEM_INSTRUCTION;

  try {
    const ai = await generateAiText({
      systemInstruction,
      user: userMessage,
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.5,
    });
    const parsed = safeJsonParse<ExtractResponse>(ai.text);
    return NextResponse.json({
      ...parsed,
      _meta: { model: ai.model, provider: ai.provider },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知錯誤";
    console.error("[course-report ai/extract] 失敗：", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
