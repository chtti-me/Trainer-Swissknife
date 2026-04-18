/**
 * 【個人師資人脈】PATCH 更新、DELETE 刪除（僅限本人資料）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_LEN = {
  displayName: 120,
  title: 200,
  organization: 200,
  expertiseDomains: 2000,
  email: 320,
  lineId: 120,
  address: 500,
  phone: 80,
  notes: 4000,
};

async function getSessionUserId() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ error: "未授權" }, { status: 401 }) };
  const userId = (session.user as { id?: string }).id;
  if (!userId) return { error: NextResponse.json({ error: "無法取得使用者" }, { status: 401 }) };
  return { userId };
}

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await getSessionUserId();
  if ("error" in auth) return auth.error;
  const { userId } = auth;
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "無效的 ID" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "無效的 JSON" }, { status: 400 });
  }

  const existing = await prisma.personalInstructorContact.findFirst({
    where: { id, ownerId: userId },
  });
  if (!existing) {
    return NextResponse.json({ error: "找不到資料或無權限" }, { status: 404 });
  }

  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : undefined);
  const displayName = str("displayName");
  const title = str("title");
  const organization = str("organization");
  const expertiseDomains = str("expertiseDomains");
  const email = str("email");
  const lineId = str("lineId");
  const address = str("address");
  const phone = str("phone");
  const notes = str("notes");

  if (displayName !== undefined && !displayName) {
    return NextResponse.json({ error: "姓名不可為空" }, { status: 400 });
  }
  if (displayName && displayName.length > MAX_LEN.displayName) {
    return NextResponse.json({ error: "姓名過長" }, { status: 400 });
  }

  for (const [val, max] of [
    [title, MAX_LEN.title],
    [organization, MAX_LEN.organization],
    [expertiseDomains, MAX_LEN.expertiseDomains],
    [email, MAX_LEN.email],
    [lineId, MAX_LEN.lineId],
    [address, MAX_LEN.address],
    [phone, MAX_LEN.phone],
    [notes, MAX_LEN.notes],
  ] as const) {
    if (val && val.length > max) {
      return NextResponse.json({ error: "欄位內容過長" }, { status: 400 });
    }
  }

  const data: {
    displayName?: string;
    title?: string | null;
    organization?: string | null;
    expertiseDomains?: string | null;
    email?: string | null;
    lineId?: string | null;
    address?: string | null;
    phone?: string | null;
    notes?: string | null;
    sortOrder?: number;
  } = {};

  if (displayName !== undefined) data.displayName = displayName;
  if (title !== undefined) data.title = title || null;
  if (organization !== undefined) data.organization = organization || null;
  if (expertiseDomains !== undefined) data.expertiseDomains = expertiseDomains || null;
  if (email !== undefined) data.email = email || null;
  if (lineId !== undefined) data.lineId = lineId || null;
  if (address !== undefined) data.address = address || null;
  if (phone !== undefined) data.phone = phone || null;
  if (notes !== undefined) data.notes = notes || null;
  if (typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)) {
    data.sortOrder = body.sortOrder;
  }

  try {
    const row = await prisma.personalInstructorContact.update({
      where: { id },
      data,
    });
    return NextResponse.json({
      contact: {
        id: row.id,
        displayName: row.displayName,
        title: row.title,
        organization: row.organization,
        expertiseDomains: row.expertiseDomains,
        email: row.email,
        lineId: row.lineId,
        address: row.address,
        phone: row.phone,
        notes: row.notes,
        sortOrder: row.sortOrder,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    console.error("[PATCH /api/personal-instructor-contacts/[id]]", e);
    return NextResponse.json({ error: "更新失敗" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await getSessionUserId();
  if ("error" in auth) return auth.error;
  const { userId } = auth;
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "無效的 ID" }, { status: 400 });

  const existing = await prisma.personalInstructorContact.findFirst({
    where: { id, ownerId: userId },
  });
  if (!existing) {
    return NextResponse.json({ error: "找不到資料或無權限" }, { status: 404 });
  }

  try {
    await prisma.personalInstructorContact.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/personal-instructor-contacts/[id]]", e);
    return NextResponse.json({ error: "刪除失敗" }, { status: 500 });
  }
}
