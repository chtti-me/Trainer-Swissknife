/**
 * 【EDM Generator：從班次帶 ClassPlan】
 *
 * GET `/api/tools/edm-generator/plan-from-class/{classId}`
 *
 * 拿 TrainingClass，對映到 EDM Generator 的 ClassPlan 並回傳。
 * 由 `<EdmClient />` 在 mount 時呼叫，接成 `initialPlan` 餵進 `<EdmGenerator />`。
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toClassPlan } from "@/lib/edm/from-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "缺少班次 ID" }, { status: 400 });
  }

  try {
    const cls = await prisma.trainingClass.findUnique({ where: { id } });
    if (!cls) {
      return NextResponse.json({ error: "查無此班次" }, { status: 404 });
    }
    return NextResponse.json(toClassPlan(cls));
  } catch (err) {
    console.error("[EDM plan-from-class] 失敗：", err);
    const message = err instanceof Error ? err.message : "未知錯誤";
    return NextResponse.json(
      { error: `班次資料讀取失敗：${message}` },
      { status: 500 }
    );
  }
}
