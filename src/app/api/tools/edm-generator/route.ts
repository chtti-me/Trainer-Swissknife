/**
 * 【EDM 產生 API】POST：模板 + OpenAI（或示範模式）產出 HTML。
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import OpenAI from "openai";
import { authOptions } from "@/lib/auth";
import { buildAiSkillPromptAppend } from "@/lib/ai-skills";
import { getPaletteById, getTemplateById } from "@/lib/edm/templates";
import { EdmGenerateRequest } from "@/lib/edm/types";

const hasApiKey = Boolean(process.env.OPENAI_API_KEY);

function toDemoHeadline(className?: string): string {
  return className ? `｢${className}｣｜與職涯同步升級的關鍵一堂課` : "精選課程｜專業力與即戰力，一次到位";
}

function toDemoSubheadline(className?: string): string {
  return className
    ? `拒絕紙上談兵——在「${className}」中，把知識變成你明天上班用得到的方法與自信。`
    : "中華電信學院經典培訓能量，與優秀同仁一起，把學習曲線拉直、把成長變成習慣。";
}

function toDemoBody(request: EdmGenerateRequest): string {
  const className = request.parsed.className || "本課程";
  const date = request.parsed.startDate ? "開班日程請以上方「開班日期」欄位為準，建議盡早完成報名。" : "正式開班日將於公告後更新，歡迎先完成報名或洽承辦窗口。";
  const audience = request.parsed.audience || "希望提升專業與工作成效的同仁";
  const loc = request.parsed.location
    ? "上課場域將提供專注學習氛圍，地點資訊已標示於本信資訊區。"
    : "實體、直播或混成模式將依班別公告為準，請以學院最新通知為準。";
  return [
    `你是否也曾感覺「聽了很多道理，回到座位卻不知如何下手」？這堂課以案例、演練與講師經驗分享交錯設計，讓 ${className} 的核心觀念真正「黏」在腦裡、帶得走。`,
    `${loc}適合 ${audience}：無論你是要補齊基礎、突破卡關，或想建立可複製的工作方法，都能在這裡找到下一步。`,
    `${date}，席次與資源有限，現在報名，等於為自己預約一段不被打擾的成長時光。把猶豫留在昨天，把行動留在今天——我們教室見。`,
  ].join("\n");
}

async function generateCopyByAi(
  request: EdmGenerateRequest,
  skillContextAppend: string
): Promise<{ headline: string; subheadline: string; body: string }> {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  });
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const prompt = `你是資深「企業內訓招生海報」文案總監兼 EDM 企劃，服務對象為中華電信學院。請根據下列課程資料，撰寫一封**讓學員願意立刻報名**的繁體中文 EDM 文案。

請嚴格輸出 JSON（不要 Markdown、不要程式碼區塊）：
{
  "headline": "主標題：18～28 字，具張力與畫面感，避免官腔",
  "subheadline": "副標：一句話價值主張，36～56 字，可帶情緒與具體收益",
  "body": "內文：約 280～420 字，分 3～5 個短段落（段落間用 \\n 分隔）。需包含：① 學員痛點或情境共鳴 ② 課程能帶來的具體改變 ③ 為何值得現在報名 ④ 明確行動呼籲。語氣需精練、有溫度，像專業設計師寫的海報敘事，不要條列式講義口吻。"
}

語調：${request.tone}
使用者額外指示：${request.customPrompt || "無"}
已勾選要呈現的欄位鍵名：${request.selectedFieldKeys.join(", ")}

課程結構化資料（JSON）：
${JSON.stringify(request.parsed)}

規則：
1. 不可捏造未在資料中出現的**具體事實**（例如不存在的日期、地點、講師姓名）；若資料缺漏，改以「將另行公告」「敬請期待」等中性表述帶過，勿編造。
2. 全文不可含任何 HTML 標籤。
3. 用字需符合企業內部訓練推廣情境，避免誇大不實或保證成效。${skillContextAppend ? `\n\n${skillContextAppend}` : ""}`;

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.75,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(content) as { headline?: string; subheadline?: string; body?: string };
  const headline = (parsed.headline || "").trim();
  const subheadline = (parsed.subheadline || "").trim();
  const body = (parsed.body || "").trim();
  if (!headline || !subheadline || !body) {
    throw new Error("AI 回傳格式不完整");
  }
  return { headline, subheadline, body };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as EdmGenerateRequest;
    if (!body?.parsed) {
      return NextResponse.json({ error: "缺少課程剖析資料" }, { status: 400 });
    }

    const template = getTemplateById(body.templateId);
    const palette = getPaletteById(body.paletteId);

    let mode: "ai" | "demo" = "demo";
    let headline = toDemoHeadline(body.parsed.className);
    let subheadline = toDemoSubheadline(body.parsed.className);
    let bodyText = toDemoBody(body);

    const userId = (session.user as { id?: string }).id || "";
    const skillAppend = userId ? await buildAiSkillPromptAppend(userId) : "";

    if (hasApiKey) {
      try {
        const ai = await generateCopyByAi(body, skillAppend);
        headline = ai.headline;
        subheadline = ai.subheadline;
        bodyText = ai.body;
        mode = "ai";
      } catch (error) {
        console.warn("EDM AI 生成失敗，改用 DEMO 文案：", error);
      }
    }

    const finalHtml = template.render({
      parsed: body.parsed,
      selectedFieldKeys: body.selectedFieldKeys || [],
      palette,
      headline,
      subheadline,
      bodyHtml: bodyText,
      images: body.images || [],
    });

    return NextResponse.json({
      mode,
      headline,
      subheadline,
      bodyHtml: bodyText,
      finalHtml,
    });
  } catch (error) {
    console.error("EDM 生成失敗：", error);
    return NextResponse.json({ error: "EDM 生成失敗，請稍後再試" }, { status: 500 });
  }
}
