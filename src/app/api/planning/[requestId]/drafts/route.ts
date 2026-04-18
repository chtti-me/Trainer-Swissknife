/**
 * 【規劃：讀取草案列表】GET：某 PlanningRequest 底下所有 PlanningDraft。
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const { requestId } = await params;
  const userId = (session.user as { id?: string }).id;
  if (!userId) {
    return NextResponse.json({ error: "無法取得使用者" }, { status: 401 });
  }

  const request = await prisma.planningRequest.findUnique({
    where: { id: requestId },
    include: {
      drafts: {
        orderBy: { versionNo: "desc" },
        include: { creator: { select: { name: true } } },
      },
    },
  });

  if (!request) {
    return NextResponse.json({ error: "找不到規劃需求" }, { status: 404 });
  }

  if (request.createdBy !== userId) {
    return NextResponse.json({ error: "無權限檢視此規劃需求" }, { status: 403 });
  }

  return NextResponse.json(request);
}
