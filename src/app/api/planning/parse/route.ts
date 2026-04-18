/**
 * 【規劃：建立規劃需求記錄】POST：建立 PlanningRequest。
 * 此路由用於建立需求記錄並返回 requestId，供後續儲存草案使用。
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const body = await req.json();
  const { text, title } = body;

  if (!text || text.trim().length === 0) {
    return NextResponse.json({ error: "請提供需求文字" }, { status: 400 });
  }

  const userId = (session.user as { id: string }).id;

  try {
    const planningRequest = await prisma.planningRequest.create({
      data: {
        createdBy: userId,
        title: title || "新課程規劃",
        rawInputText: text,
        parsedSummary: "{}",
        status: "draft",
      },
    });

    return NextResponse.json({
      requestId: planningRequest.id,
    });
  } catch (error) {
    console.error("[POST /api/planning/parse]", error);
    return NextResponse.json({ error: "建立規劃需求記錄失敗" }, { status: 500 });
  }
}
