/**
 * 【EDM Generator AI Image Proxy】
 *
 * EDM Generator 用的兩個圖片模型（`imagen-4.0-generate-001` / `gemini-2.5-flash-image`）
 * 都是 Gemini 原生 API，OpenAI-compatible 端點不支援，所以這個 route 直接走
 * `@google/genai` SDK + `process.env.GEMINI_API_KEY`。
 *
 * 行為與 EDM Generator 桌面版的 `geminiBrowser.ts` 一致：
 *   - withText=true → 直接走 gemini-2.5-flash-image
 *   - withText=false → 先試 imagen-4.0-generate-001，失敗 fallback gemini-2.5-flash-image
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { GoogleGenAI } from "@google/genai";
import { authOptions } from "@/lib/auth";
import type {
  AiGenerateImageOpts,
  AiGenerateImageResult,
} from "@edm/lib/ai/adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getGeminiClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "未設定 GEMINI_API_KEY；EDM Hero 圖生成需要 Gemini 原生 API（OpenAI-compatible 端點不支援 Imagen）"
    );
  }
  return new GoogleGenAI({ apiKey: key });
}

async function generateWithImagen(
  client: GoogleGenAI,
  opts: AiGenerateImageOpts
): Promise<AiGenerateImageResult> {
  const model = "imagen-4.0-generate-001";
  const res = await client.models.generateImages({
    model,
    prompt: opts.prompt,
    config: { numberOfImages: 1, aspectRatio: opts.ratio },
  });
  const img = res.generatedImages?.[0]?.image;
  if (!img?.imageBytes) {
    throw new Error("Imagen 未回傳圖片");
  }
  const mimeType = img.mimeType ?? "image/png";
  return {
    base64: img.imageBytes,
    mimeType,
    dataUrl: `data:${mimeType};base64,${img.imageBytes}`,
    model,
  };
}

async function generateWithFlashImage(
  client: GoogleGenAI,
  opts: AiGenerateImageOpts
): Promise<AiGenerateImageResult> {
  const model = "gemini-2.5-flash-image";
  const res = await client.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
  });
  const cand = res.candidates?.[0];
  const inlineData = cand?.content?.parts?.find(
    (p): p is { inlineData: { data: string; mimeType?: string } } =>
      "inlineData" in p && Boolean(p.inlineData?.data)
  )?.inlineData;
  if (!inlineData?.data) {
    throw new Error("生圖模型未回傳圖片，請稍後再試或調整提示詞");
  }
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
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  let opts: AiGenerateImageOpts;
  try {
    opts = (await req.json()) as AiGenerateImageOpts;
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  if (!opts?.prompt || !opts.ratio) {
    return NextResponse.json(
      { error: "缺少必要欄位：prompt 與 ratio" },
      { status: 400 }
    );
  }

  let client: GoogleGenAI;
  try {
    client = getGeminiClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知錯誤";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  try {
    if (opts.withText) {
      const out = await generateWithFlashImage(client, opts);
      return NextResponse.json(out);
    }
    try {
      const out = await generateWithImagen(client, opts);
      return NextResponse.json(out);
    } catch (imagenErr) {
      console.warn(
        "[EDM ai/image] Imagen 失敗，fallback gemini-2.5-flash-image：",
        imagenErr
      );
      const out = await generateWithFlashImage(client, opts);
      return NextResponse.json(out);
    }
  } catch (err) {
    console.error("[EDM ai/image] 失敗：", err);
    const message = err instanceof Error ? err.message : "未知錯誤";
    return NextResponse.json(
      { error: `Hero 圖生成失敗：${message}` },
      { status: 500 }
    );
  }
}
