/**
 * 【AI 對話匯出】GET → Markdown 下載
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未授權" }, { status: 401 });

  const { id } = await params;
  const userId = (session.user as any).id;

  const conv = await prisma.agentConversation.findFirst({
    where: { id, userId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!conv) return NextResponse.json({ error: "找不到對話" }, { status: 404 });

  const lines: string[] = [
    `# ${conv.title}`,
    `> 匯出時間：${new Date().toLocaleString("zh-TW")}`,
    `> 建立時間：${new Date(conv.createdAt).toLocaleString("zh-TW")}`,
    "",
    "---",
    "",
  ];

  for (const msg of conv.messages) {
    const roleLabel = msg.role === "user" ? "👤 使用者" : msg.role === "assistant" ? "🤖 小瑞" : "🔧 工具";
    const time = new Date(msg.createdAt).toLocaleTimeString("zh-TW");
    lines.push(`### ${roleLabel}（${time}）`);
    lines.push("");
    lines.push(msg.content);
    lines.push("");

    if (msg.toolCalls) {
      try {
        const tools = JSON.parse(msg.toolCalls);
        if (Array.isArray(tools) && tools.length > 0) {
          lines.push("<details><summary>工具呼叫紀錄</summary>");
          lines.push("");
          lines.push("```json");
          lines.push(JSON.stringify(tools, null, 2));
          lines.push("```");
          lines.push("</details>");
          lines.push("");
        }
      } catch { /* ignore */ }
    }

    lines.push("---");
    lines.push("");
  }

  const md = lines.join("\n");

  return new NextResponse(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="conversation-${id.slice(0, 8)}.md"`,
    },
  });
}
