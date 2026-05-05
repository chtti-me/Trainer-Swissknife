/**
 * 【課程規劃報告產生器 - AI 優化文字】
 *
 * POST /api/tools/course-report/ai/optimize-text
 *   Body: {
 *     text: string;           // 要優化的選取文字
 *     contextField?: string;  // 例 "purpose" / "design.summary" / "benefit.0"
 *     reportSnapshot?: {      // 整份報告的精簡概覽，給 AI 上下文
 *       title?: string;
 *       reporter?: string;
 *       department?: string;
 *     };
 *     style?: "formal" | "concise" | "vivid"; // 預設 formal
 *   }
 *
 *   回傳 { text: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateAiText } from "../../_lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Req {
  text: string;
  contextField?: string;
  reportSnapshot?: {
    title?: string;
    reporter?: string;
    department?: string;
  };
  style?: "formal" | "concise" | "vivid";
}

const STYLE_HINT: Record<NonNullable<Req["style"]>, string> = {
  formal: "正式、典雅、適合對長官報告，但避免冗詞贅字。",
  concise: "極簡精要、條列重點。",
  vivid: "生動、有具體例子、能勾起讀者注意。",
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未授權" }, { status: 401 });

  let body: Req;
  try {
    body = (await req.json()) as Req;
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }
  const text = (body.text || "").trim();
  if (!text) return NextResponse.json({ error: "缺少 text" }, { status: 400 });
  const style = body.style ?? "formal";

  const ctxParts: string[] = [];
  if (body.reportSnapshot?.title) ctxParts.push(`報告標題：${body.reportSnapshot.title}`);
  if (body.reportSnapshot?.reporter) ctxParts.push(`報告人：${body.reportSnapshot.reporter}`);
  if (body.reportSnapshot?.department) ctxParts.push(`學系：${body.reportSnapshot.department}`);
  if (body.contextField) ctxParts.push(`此段落屬於：${body.contextField}`);

  const systemInstruction = `你是中華電信學院培訓師的撰稿教練。
任務：把使用者選取的段落「優化」為更專業的中文。
原則：
- 不改變原意，不發明新事實
- 文字風格：${STYLE_HINT[style]}
- 字數：與原文相仿，可略增刪 30%
- 保留原文中已有的數字、姓名、課程名稱、單位
- 直接回傳優化後的純文字（不要前後加說明、不要 markdown 標記）`;

  const user = `【上下文】\n${ctxParts.join("\n") || "（無額外上下文）"}\n\n【原文】\n${text}\n\n請輸出優化後的版本：`;

  try {
    const ai = await generateAiText({
      systemInstruction,
      user,
      temperature: 0.6,
    });
    return NextResponse.json({ text: ai.text.trim(), model: ai.model, provider: ai.provider });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知錯誤";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
