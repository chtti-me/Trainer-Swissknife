/**
 * 課程規劃工具箱 — Partial Pipeline SSE 端點
 *
 *  POST /api/course-planner/skills/run-partial
 *
 *  Body:
 *    {
 *      "selected": ["outline", "schedule", "instructor", "promo"],   // 必填
 *      "rawText"?: "需求段落（≥10 字）",                              // mode A
 *      "referenceRequestId"?: "uuid",                                 // mode B
 *      "preferredTotalHours"?: number,
 *      "preferredDays"?: number,
 *      "aiProvider"?: "gemini" | "openai" | "groq"
 *    }
 *
 *  rawText 與 referenceRequestId 必須擇一提供。
 *  Response：text/event-stream（每筆事件 `data: {...}\n\n`）。
 */
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  runPartialPipeline,
  type PartialPipelineOptions,
} from "@/lib/course-planner/partial-pipeline";
import { validateSelectedSkills } from "@/lib/course-planner/skill-toolbox";
import type { AiProvider } from "@/lib/ai-provider";

export const runtime = "nodejs";
export const maxDuration = 300;

function jsonError(error: string, status = 400): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizeProvider(raw: unknown): AiProvider | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "openai" || v === "gemini" || v === "groq") return v;
  return null;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return jsonError("未登入", 401);
  const userId = (session.user as { id: string }).id;

  let body: {
    selected?: unknown;
    rawText?: unknown;
    referenceRequestId?: unknown;
    preferredTotalHours?: unknown;
    preferredDays?: unknown;
    aiProvider?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("請傳入 JSON");
  }

  const validated = validateSelectedSkills(body.selected);
  if (!validated.ok) return jsonError(validated.error);

  const rawText = typeof body.rawText === "string" ? body.rawText.trim() : "";
  const referenceRequestId =
    typeof body.referenceRequestId === "string" ? body.referenceRequestId.trim() : "";

  if (!rawText && !referenceRequestId) {
    return jsonError("請提供 rawText（≥10 字）或 referenceRequestId 兩者擇一");
  }
  if (rawText && referenceRequestId) {
    return jsonError("rawText 與 referenceRequestId 只能擇一提供");
  }
  if (rawText && rawText.length < 10) {
    return jsonError("rawText 至少 10 字");
  }

  const options: PartialPipelineOptions = {
    userId,
    selectedSkills: validated.selected,
    rawText: rawText || undefined,
    referenceRequestId: referenceRequestId || undefined,
    provider: normalizeProvider(body.aiProvider),
    preferredTotalHours:
      typeof body.preferredTotalHours === "number" && body.preferredTotalHours > 0
        ? body.preferredTotalHours
        : undefined,
    preferredDays:
      typeof body.preferredDays === "number" && body.preferredDays > 0 ? body.preferredDays : undefined,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      try {
        for await (const event of runPartialPipeline(options)) {
          send(event);
        }
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
