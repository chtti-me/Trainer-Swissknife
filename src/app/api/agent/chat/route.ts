/**
 * POST /api/agent/chat - Agent 對話端點（SSE 串流）
 */
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runAgent } from "@/lib/agent/core";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "未授權" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as {
      conversationId?: string;
      message?: string;
      imageUrls?: string[];
    };

    const message = String(body.message || "").trim();
    if (!message) {
      return new Response(JSON.stringify({ error: "訊息不得為空" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userId = (session.user as { id?: string }).id || "";
    if (!userId) {
      return new Response(JSON.stringify({ error: "無法取得使用者 ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { conversationId, stream } = await runAgent({
      userId,
      conversationId: body.conversationId,
      userMessage: message,
      imageUrls: body.imageUrls,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Conversation-Id": conversationId,
      },
    });
  } catch (e) {
    console.error("[agent/chat]", e);
    return new Response(
      JSON.stringify({ error: `Agent 錯誤：${(e as Error).message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
