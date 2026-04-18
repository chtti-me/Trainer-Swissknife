/**
 * 精簡版課程規劃幫手 - 產生課程規劃 API
 * POST /api/planning/generate
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runCoursePlanAgent } from "@/lib/planning/agent";
import {
  buildAiSkillPromptAppend,
  PLANNING_INCLUDED_GLOBAL_SLUGS,
  PLANNING_INCLUDED_SLUG_PREFIXES,
} from "@/lib/ai-skills";
import type { CoursePlanInput, CoursePlanResult } from "@/lib/planning/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface GenerateResponse {
  success: boolean;
  result?: CoursePlanResult;
  error?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<GenerateResponse>> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "未登入" }, { status: 401 });
    }

    const body = (await req.json()) as Partial<CoursePlanInput>;
    const { requirementText, preferredTitle, preferredHours } = body;

    if (!requirementText || typeof requirementText !== "string" || requirementText.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: "請輸入至少 10 個字的培訓需求" },
        { status: 400 }
      );
    }

    const input: CoursePlanInput = {
      requirementText: requirementText.trim(),
      preferredTitle: preferredTitle?.trim() || undefined,
      preferredHours:
        typeof preferredHours === "number" && preferredHours > 0 ? preferredHours : undefined,
    };

    const userId = (session.user as { id: string }).id;
    const skillAppend = await buildAiSkillPromptAppend(userId, {
      includeSlugs: [...PLANNING_INCLUDED_GLOBAL_SLUGS],
      includeSlugPrefixes: [...PLANNING_INCLUDED_SLUG_PREFIXES],
    });

    const result = await runCoursePlanAgent(input, {
      skillContextAppend: skillAppend,
    });

    return NextResponse.json({ success: true, result });
  } catch (e) {
    console.error("[POST /api/planning/generate]", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
