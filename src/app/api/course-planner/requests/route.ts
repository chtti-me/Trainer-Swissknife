/**
 * 課程規劃幫手 — Request 主端點
 *  POST /api/course-planner/requests   建立新規劃需求
 *  GET  /api/course-planner/requests   列出當前使用者的規劃需求
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;

  let body: { rawInputText?: string; title?: string; sourceFiles?: unknown; aiProvider?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "請傳入 JSON" }, { status: 400 });
  }

  const text = String(body.rawInputText ?? "").trim();
  if (text.length < 10) {
    return NextResponse.json({ error: "請輸入至少 10 個字的培訓需求" }, { status: 400 });
  }

  const aiProvider = normalizeAiProviderInput(body.aiProvider);

  const request = await prisma.coursePlanRequest.create({
    data: {
      createdBy: userId,
      title: body.title?.toString().trim() || null,
      rawInputText: text,
      sourceFiles: body.sourceFiles ? JSON.stringify(body.sourceFiles) : null,
      status: "pending",
      aiProvider,
    },
  });

  return NextResponse.json({ request });
}

/** 把使用者輸入的 aiProvider 轉成允許的列舉，否則回 null（走 env 預設） */
function normalizeAiProviderInput(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "openai" || v === "gemini" || v === "groq") return v;
  return null;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;

  // 預設只列「完整規劃」（kind=full）；ts/工具箱建立的 toolbox 規劃單預設不顯示在主入口列表
  // 若呼叫端帶 ?kind=toolbox / ?kind=all，可顯示 toolbox 或全部
  const kindParam = (req.nextUrl?.searchParams?.get("kind") || "").trim().toLowerCase();
  const where: { createdBy: string; kind?: string } = { createdBy: userId };
  if (kindParam === "all") {
    // 不加 kind 條件
  } else if (kindParam === "toolbox") {
    where.kind = "toolbox";
  } else {
    where.kind = "full";
  }

  const requests = await prisma.coursePlanRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      rawInputText: true,
      status: true,
      currentSkill: true,
      reuseClassId: true,
      aiProvider: true,
      kind: true,
      createdAt: true,
      updatedAt: true,
    },
    take: 50,
  });

  return NextResponse.json({ requests });
}
