/**
 * 課程規劃幫手 — 檢查單一 Skill 是否「上次結果還在、input 未變」
 *  GET /api/course-planner/requests/[id]/skills/[name]/check-rerun
 *
 * 回傳 { canSkip, lastRunAt, lastDurationMs }，給前端決定是否要顯示「強制重跑嗎？」確認對話。
 *
 * 判斷邏輯（簡化版，accuracy 用「上游時間戳」近似）：
 *   - 若該 Skill 沒有任何成功 run → canSkip=false（要跑了才有快取）
 *   - 若有任一上游 Skill 的 latest success run 比本 Skill 的 latest success run 「晚」 → 上游有改 → canSkip=false
 *   - 否則 canSkip=true（直接重跑大概率會命中 input-hash cache）
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LLM_SKILL_NAMES, SKILL_UPSTREAM, type LlmSkillName } from "@/lib/course-planner/schemas/common";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; name: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;
  const { id, name } = await params;

  if (!(LLM_SKILL_NAMES as readonly string[]).includes(name)) {
    return NextResponse.json({ error: `未知 Skill：${name}` }, { status: 400 });
  }
  const skill = name as LlmSkillName;

  const exists = await prisma.coursePlanRequest.findFirst({
    where: { id, createdBy: userId },
    select: { id: true },
  });
  if (!exists) {
    return NextResponse.json({ error: "找不到規劃需求" }, { status: 404 });
  }

  const latest = await prisma.coursePlanSkillRun.findFirst({
    where: { requestId: id, skillName: skill, status: "success" },
    orderBy: { sequence: "desc" },
    select: { id: true, createdAt: true, durationMs: true, sequence: true },
  });

  if (!latest) {
    return NextResponse.json({
      canSkip: false,
      reason: "no_previous_run",
      lastRunAt: null,
      lastDurationMs: null,
    });
  }

  const upstream = SKILL_UPSTREAM[skill];
  if (upstream.length === 0) {
    // needs 沒有上游 → 只能說「之前跑過」，input 是否變化我們無從判斷（rawInputText 可能變）
    // 不阻擋，但也不主動建議跳過
    return NextResponse.json({
      canSkip: true,
      reason: "no_upstream_changes_detectable",
      lastRunAt: latest.createdAt.toISOString(),
      lastDurationMs: latest.durationMs,
      lastSequence: latest.sequence,
    });
  }

  const latestSelfTs = latest.createdAt.getTime();
  const upstreamRuns = await prisma.coursePlanSkillRun.findMany({
    where: {
      requestId: id,
      skillName: { in: upstream as unknown as string[] },
      status: "success",
    },
    orderBy: [{ skillName: "asc" }, { sequence: "desc" }],
    select: { skillName: true, createdAt: true, sequence: true },
  });

  // 取每個上游 Skill 的最新一筆
  const latestPerUpstream = new Map<string, number>();
  for (const r of upstreamRuns) {
    if (!latestPerUpstream.has(r.skillName)) {
      latestPerUpstream.set(r.skillName, r.createdAt.getTime());
    }
  }

  // 任一上游晚於本 Skill 的最新成功 run → 上游動過
  for (const [, ts] of latestPerUpstream) {
    if (ts > latestSelfTs) {
      return NextResponse.json({
        canSkip: false,
        reason: "upstream_updated",
        lastRunAt: new Date(latestSelfTs).toISOString(),
        lastDurationMs: latest.durationMs,
        lastSequence: latest.sequence,
      });
    }
  }

  return NextResponse.json({
    canSkip: true,
    reason: "no_upstream_changes",
    lastRunAt: new Date(latestSelfTs).toISOString(),
    lastDurationMs: latest.durationMs,
    lastSequence: latest.sequence,
  });
}
