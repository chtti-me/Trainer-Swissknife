/**
 * 【課程規劃報告產生器 - AI 生資料圖表】
 *
 * POST /api/tools/course-report/ai/chart
 *   Body: { text: string }
 *
 *   回傳：
 *     成功：{ ok: true, spec: { type, title, labels, datasets } }
 *     失敗（缺數據）：{ ok: false, reason: string }
 *
 * 流程：
 *   1) AI 先判斷選取段落是否含可量化資料
 *   2) 有 → 回傳 chart spec
 *   3) 無 → ok=false + 原因（前端顯示 toast）
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateAiText, safeJsonParse } from "../../_lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Req {
  text: string;
}

interface ChartSpec {
  type: "bar" | "line" | "pie" | "doughnut";
  title?: string;
  labels: string[];
  datasets: { label: string; data: number[] }[];
}

interface AiResponse {
  ok: boolean;
  reason?: string;
  spec?: ChartSpec;
}

const SYSTEM = `你是中華電信學院培訓師的資料分析助手。
任務：判斷使用者選取的中文段落是否含「可量化的資料」（例如：百分比、人數、節數、滿意度、成長率、預算金額、課程時數對比等）。

回傳 JSON：
- 若有可量化資料：
{
  "ok": true,
  "spec": {
    "type": "bar" | "line" | "pie" | "doughnut",
    "title": "圖表標題（中文，10–20 字）",
    "labels": ["標籤A", "標籤B", ...],
    "datasets": [{ "label": "系列名稱", "data": [數字, 數字, ...] }, ...]
  }
}

- 若無可量化資料、或數據過少（少於 2 個有意義的數值）：
{
  "ok": false,
  "reason": "簡短說明，告訴使用者『缺少哪種資料元素』，並建議補哪些數字。"
}

判斷原則：
- 只接受「實際出現在文字中的數字」，不要憑空捏造
- 若使用者在文字中提到「30%、5 人、3 天、20 萬」這類具體數字，視為有資料
- 若文字只說「提升效率、改善品質」這類定性描述，視為無資料
- 圖表類型選擇：
   - 比較數量/分布 → bar
   - 時間序列 → line
   - 占比/組成 → pie 或 doughnut（選一個）
- labels 與 data 的長度必須相同，且至少 2 個元素
- 數字保留到小數點以下 1 位（除非原文已有更精確值）`;

const RESPONSE_SCHEMA = {
  type: "object" as const,
  properties: {
    ok: { type: "boolean" },
    reason: { type: "string" },
    spec: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["bar", "line", "pie", "doughnut"] },
        title: { type: "string" },
        labels: { type: "array", items: { type: "string" } },
        datasets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              data: { type: "array", items: { type: "number" } },
            },
          },
        },
      },
    },
  },
};

function validateSpec(spec: ChartSpec | undefined): string | null {
  if (!spec) return "AI 未回傳 spec";
  if (!spec.type || !spec.labels || !spec.datasets) return "spec 結構不完整";
  if (!Array.isArray(spec.labels) || spec.labels.length < 2) return "labels 不足 2 個";
  if (!Array.isArray(spec.datasets) || spec.datasets.length === 0) return "datasets 為空";
  for (const ds of spec.datasets) {
    if (!Array.isArray(ds.data)) return "dataset.data 不是陣列";
    if (ds.data.length !== spec.labels.length) return "data 與 labels 長度不一致";
    if (!ds.data.every((d) => Number.isFinite(d))) return "data 含非數字";
  }
  return null;
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
  const text = (body.text || "").trim();
  if (!text) return NextResponse.json({ error: "缺少 text" }, { status: 400 });

  try {
    const ai = await generateAiText({
      systemInstruction: SYSTEM,
      user: `【段落】\n${text}\n\n請判斷並依規格回傳 JSON。`,
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.3,
    });
    const parsed = safeJsonParse<AiResponse>(ai.text);
    if (!parsed.ok) {
      return NextResponse.json({
        ok: false,
        reason: parsed.reason || "選取段落缺少數據元素，無法生成圖表。請補上具體的數字（例如百分比、人數、金額、時數等）。",
      });
    }
    const err = validateSpec(parsed.spec);
    if (err) {
      return NextResponse.json({ ok: false, reason: `AI 回傳的圖表結構有誤：${err}` });
    }
    return NextResponse.json({ ok: true, spec: parsed.spec, model: ai.model, provider: ai.provider });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知錯誤";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
