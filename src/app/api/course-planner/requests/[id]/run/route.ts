/**
 * 課程規劃幫手 — 執行 Pipeline（SSE 串流）
 *  POST /api/course-planner/requests/[id]/run
 *
 * Body: { preferredTotalHours?, preferredDays? }
 *
 * 回應為 text/event-stream，每個事件的 data 為 OrchestratorEvent JSON。
 * 收到 [DONE] 表示串流結束。
 */
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runPipeline } from "@/lib/course-planner/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "未登入" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const userId = (session.user as { id: string }).id;
  const { id } = await params;

  const exists = await prisma.coursePlanRequest.findFirst({
    where: { id, createdBy: userId },
    select: { id: true },
  });
  if (!exists) {
    return new Response(JSON.stringify({ error: "找不到規劃需求" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = (await req.json().catch(() => ({}))) as {
    preferredTotalHours?: number;
    preferredDays?: number;
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        for await (const event of runPipeline(id, {
          preferredTotalHours: body.preferredTotalHours,
          preferredDays: body.preferredDays,
        })) {
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
