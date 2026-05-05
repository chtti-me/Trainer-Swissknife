/**
 * 課程規劃幫手 — 從某個 Skill 開始重跑 Pipeline（SSE 串流）
 *  POST /api/course-planner/requests/[id]/skills/[name]/run
 *
 * 自動帶上「該 Skill + 所有下游 Skill」一起重跑。
 * 上游 Skill 的最新 output 會從 DB 撈出來當 existingOutputs 餵給 orchestrator。
 */
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runPipeline } from "@/lib/course-planner/orchestrator";
import { LLM_SKILL_NAMES, SKILL_PIPELINE_ORDER, type LlmSkillName } from "@/lib/course-planner/schemas/common";
import type { AllSkillOutputs } from "@/lib/course-planner/form-mapper";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; name: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "未登入" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const userId = (session.user as { id: string }).id;
  const { id, name } = await params;

  if (!(LLM_SKILL_NAMES as readonly string[]).includes(name)) {
    return new Response(JSON.stringify({ error: `未知 Skill：${name}` }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const startSkill = name as LlmSkillName;

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
    /** 強制重跑：true 時忽略 input-hash cache，一定打 LLM */
    forceRerun?: boolean;
  };

  // 撈上游 Skill 的最新 output 作為 existingOutputs
  const startIdx = SKILL_PIPELINE_ORDER.indexOf(startSkill);
  const upstreamSkills = SKILL_PIPELINE_ORDER.slice(0, startIdx);
  const allRuns = await prisma.coursePlanSkillRun.findMany({
    where: { requestId: id, status: "success", skillName: { in: upstreamSkills as unknown as string[] } },
    orderBy: [{ skillName: "asc" }, { sequence: "desc" }],
    select: { skillName: true, sequence: true, output: true },
  });
  const latestBySkill = new Map<string, unknown>();
  for (const r of allRuns) {
    if (!latestBySkill.has(r.skillName)) latestBySkill.set(r.skillName, r.output);
  }

  // 缺上游就提早回錯
  const missing = upstreamSkills.filter((s) => !latestBySkill.has(s));
  if (missing.length > 0) {
    return new Response(
      JSON.stringify({
        error: `重跑 ${startSkill} 之前，需要下列上游 Skill 已成功執行：${missing.join(", ")}。請先從第一個 Skill 開始重跑。`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const existingOutputs = Object.fromEntries(latestBySkill.entries()) as Partial<AllSkillOutputs>;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      try {
        for await (const event of runPipeline(id, {
          skipExistingLookup: true,
          startFromSkill: startSkill,
          existingOutputs,
          preferredTotalHours: body.preferredTotalHours,
          preferredDays: body.preferredDays,
          forceRerun: body.forceRerun === true,
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
