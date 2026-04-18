/**
 * GET /api/agent/briefing — 取得小瑞的主動日報簡報
 * 前端可定期輪詢此端點，顯示主動通知提示。
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateBriefing } from "@/lib/agent/tools/proactive-briefing";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未授權" }, { status: 401 });

  const userId = (session.user as any).id;

  try {
    const briefing = await generateBriefing(userId);

    const hasContent =
      briefing.todayClasses.length > 0 ||
      briefing.tomorrowClasses.length > 0 ||
      briefing.upcomingAlarms.length > 0;

    return NextResponse.json({
      hasContent,
      briefing,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
