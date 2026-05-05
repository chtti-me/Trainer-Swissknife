/**
 * 【課程規劃報告產生器 - AI 生圖】
 *
 * POST /api/tools/course-report/ai/image
 *   Body: {
 *     text: string;            // 使用者選取的文字（要從這段文字生圖）
 *     ratio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
 *     extraPrompt?: string;    // 風格提示
 *   }
 *
 *   回傳 { dataUrl, base64, mimeType, model }
 *
 * 沿用 EDM 的 Gemini 原生 image API（imagen-4.0 → fallback gemini-2.5-flash-image）。
 * 圖片風格自動帶入「中華電信深藍 + 白」品牌指示。
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { GoogleGenAI } from "@google/genai";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Req {
  text: string;
  ratio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  extraPrompt?: string;
}

interface ImageResult {
  base64: string;
  mimeType: string;
  dataUrl: string;
  model: string;
}

function getGeminiClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "未設定 GEMINI_API_KEY；課程規劃報告生圖需要 Gemini 原生 API（OpenAI-compatible 端點不支援 Imagen）"
    );
  }
  return new GoogleGenAI({ apiKey: key });
}

const BRAND_PROMPT_SUFFIX =
  "Style: clean, professional Chinese corporate report illustration. " +
  "Color palette: navy blue (#1f3a8a), white, with subtle accent of cyan or amber. " +
  "Composition: balanced, simple, suitable for embedding in a course planning report. " +
  "Avoid text overlays. No watermark, no signature.";

function buildPrompt(req: Req): string {
  const base = `Based on the following Chinese-language description for a corporate training course report, generate a tasteful illustration that visually represents its key concept.

Description (in Traditional Chinese):
${req.text.trim()}

${req.extraPrompt ? `Extra hint: ${req.extraPrompt}\n` : ""}${BRAND_PROMPT_SUFFIX}`;
  return base;
}

async function generateWithImagen(
  client: GoogleGenAI,
  prompt: string,
  ratio: string
): Promise<ImageResult> {
  const model = "imagen-4.0-generate-001";
  const res = await client.models.generateImages({
    model,
    prompt,
    config: { numberOfImages: 1, aspectRatio: ratio },
  });
  const img = res.generatedImages?.[0]?.image;
  if (!img?.imageBytes) throw new Error("Imagen 未回傳圖片");
  const mimeType = img.mimeType ?? "image/png";
  return {
    base64: img.imageBytes,
    mimeType,
    dataUrl: `data:${mimeType};base64,${img.imageBytes}`,
    model,
  };
}

async function generateWithFlashImage(client: GoogleGenAI, prompt: string): Promise<ImageResult> {
  const model = "gemini-2.5-flash-image";
  const res = await client.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  const cand = res.candidates?.[0];
  const inlineData = cand?.content?.parts?.find(
    (p): p is { inlineData: { data: string; mimeType?: string } } =>
      "inlineData" in p && Boolean(p.inlineData?.data)
  )?.inlineData;
  if (!inlineData?.data) throw new Error("生圖模型未回傳圖片，請稍後再試或調整提示詞");
  const mimeType = inlineData.mimeType ?? "image/png";
  return {
    base64: inlineData.data,
    mimeType,
    dataUrl: `data:${mimeType};base64,${inlineData.data}`,
    model,
  };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未授權" }, { status: 401 });

  let body: Req;
  try {
    body = (await req.json()) as Req;
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }
  if (!body.text || !body.text.trim()) {
    return NextResponse.json({ error: "缺少 text" }, { status: 400 });
  }

  let client: GoogleGenAI;
  try {
    client = getGeminiClient();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "未知錯誤" },
      { status: 500 }
    );
  }

  const ratio = body.ratio ?? "16:9";
  const prompt = buildPrompt(body);

  try {
    try {
      const out = await generateWithImagen(client, prompt, ratio);
      return NextResponse.json(out);
    } catch (imagenErr) {
      console.warn("[course-report ai/image] Imagen 失敗，fallback flash-image：", imagenErr);
      const out = await generateWithFlashImage(client, prompt);
      return NextResponse.json(out);
    }
  } catch (err) {
    console.error("[course-report ai/image] 失敗：", err);
    const msg = err instanceof Error ? err.message : "未知錯誤";
    return NextResponse.json({ error: `生圖失敗：${msg}` }, { status: 500 });
  }
}
