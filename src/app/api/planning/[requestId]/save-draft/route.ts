/**
 * 【規劃：儲存草案】POST：新增或更新 PlanningDraft。
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const { requestId } = await params;
  const userId = (session.user as any).id;
  const body = await req.json();

  const request = await prisma.planningRequest.findUnique({
    where: { id: requestId },
    include: { drafts: { orderBy: { versionNo: "desc" }, take: 1 } },
  });

  if (!request) {
    return NextResponse.json({ error: "找不到規劃需求" }, { status: 404 });
  }

  if (request.createdBy !== userId) {
    return NextResponse.json({ error: "無權限儲存此規劃需求" }, { status: 403 });
  }

  const nextVersion = (request.drafts[0]?.versionNo || 0) + 1;

  const editedContent =
    body?.editedContent && typeof body.editedContent === "object"
      ? body.editedContent
      : null;

  const draft = await prisma.planningDraft.create({
    data: {
      requestId,
      versionNo: nextVersion,
      aiOutputJson: body.aiOutputJson || request.drafts[0]?.aiOutputJson,
      editedOutputJson: editedContent ? JSON.stringify(editedContent) : null,
      createdBy: userId,
    },
  });

  return NextResponse.json({ draft });
}
