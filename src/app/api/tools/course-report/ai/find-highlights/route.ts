/**
 * 【課程規劃報告產生器 - AI 發掘亮點】
 *
 * POST /api/tools/course-report/ai/find-highlights
 *   Body: {
 *     text: string;           // 選取段落
 *     reportSnapshot?: {...}; // 整份報告概覽
 *   }
 *
 *   回傳 { highlights: string[] }（3–5 個亮點 bullet）
 *
 * 與 optimize-text 不同：本 API 專門「發掘潛藏亮點 + 發想新亮點」，
 * 適合使用者在報告中段落上 highlight 一段內容後，想被啟發更多角度。
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateAiText, safeJsonParse } from "../../_lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Req {
  text: string;
  reportSnapshot?: {
    title?: string;
    reporter?: string;
    department?: string;
    purpose?: string;
  };
}

const RESPONSE_SCHEMA = {
  type: "object" as const,
  properties: {
    highlights: {
      type: "array",
      items: { type: "string" },
    },
    notes: { type: "string" },
  },
};

const SYSTEM = `你是中華電信學院培訓師的撰稿教練。
任務：根據使用者選取的段落 + 報告整體脈絡，「發掘潛藏亮點」並「發想可能可發揮的新亮點」。

亮點的方向（多角度發想）：
- 對公司營運：可提升效率 / 改善品質 / 節省金錢 / 提高營收能力
- 對學員：可學到、能應用於工作的具體技能、職涯成長
- 對組織：跨部門合作、創新文化、轉型動能
- 對外部：對標市場 / 業界專家、提升學院聲譽
- 對長官 / 決策層：政策呼應、KPI 對齊、戰略價值
- 創新元素：新工具、新教學法、新合作夥伴、新技術領域

要求：
- 回傳 3–5 個亮點，每個 1 句完整中文（25–60 字）
- 必須能從段落或報告整體合理推論，不要憑空捏造具體數字、姓名
- 用具體動詞與量詞（即使是估計也說「預計」「約」），避免「很棒」「很好」這種空泛形容
- 以 JSON 回傳：{ "highlights": ["...", "..."], "notes": "可選的補充說明" }`;

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

  const snap = body.reportSnapshot;
  const ctx = [
    snap?.title && `報告標題：${snap.title}`,
    snap?.reporter && `報告人：${snap.reporter}`,
    snap?.department && `學系：${snap.department}`,
    snap?.purpose && `案由與目的：${snap.purpose}`,
  ]
    .filter(Boolean)
    .join("\n");

  const user = `【報告脈絡】\n${ctx || "（無額外脈絡）"}\n\n【使用者選取段落】\n${text}\n\n請發掘並發想 3–5 個亮點，以 JSON 回傳。`;

  try {
    const ai = await generateAiText({
      systemInstruction: SYSTEM,
      user,
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.8,
    });
    const parsed = safeJsonParse<{ highlights?: string[]; notes?: string }>(ai.text);
    const highlights = (parsed.highlights ?? []).filter((s) => s && typeof s === "string").map((s) => s.trim());
    if (highlights.length === 0) {
      return NextResponse.json(
        { error: "AI 未產生任何亮點，請改用更具體的段落再試一次。" },
        { status: 422 }
      );
    }
    return NextResponse.json({ highlights, notes: parsed.notes ?? "", model: ai.model, provider: ai.provider });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知錯誤";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
