/**
 * 【個人師資人脈】GET 列表、POST 新增（僅限目前登入使用者之資料）。
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

export async function GET() {
  const auth = await getSessionUserId();
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  try {
    const rows = await prisma.personalInstructorContact.findMany({
      where: { ownerId: userId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({
      contacts: rows.map((r) => ({
        id: r.id,
        displayName: r.displayName,
        title: r.title,
        organization: r.organization,
        expertiseDomains: r.expertiseDomains,
        email: r.email,
        lineId: r.lineId,
        address: r.address,
        phone: r.phone,
        notes: r.notes,
        sortOrder: r.sortOrder,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error("[GET /api/personal-instructor-contacts]", e);
    return NextResponse.json({ error: "讀取失敗" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await getSessionUserId();
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "無效的 JSON" }, { status: 400 });
  }

  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  if (!displayName) {
    return NextResponse.json({ error: "請填寫姓名（display name，顯示名稱）" }, { status: 400 });
  }
  if (displayName.length > MAX_LEN.displayName) {
    return NextResponse.json({ error: "姓名過長" }, { status: 400 });
  }

  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : undefined);
  const title = str("title");
  const organization = str("organization");
  const expertiseDomains = str("expertiseDomains");
  const email = str("email");
  const lineId = str("lineId");
  const address = str("address");
  const phone = str("phone");
  const notes = str("notes");
  const sortOrder = typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder) ? body.sortOrder : 0;

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

  try {
    const maxSort = await prisma.personalInstructorContact.aggregate({
      where: { ownerId: userId },
      _max: { sortOrder: true },
    });
    const nextOrder =
      sortOrder !== 0 ? sortOrder : (maxSort._max.sortOrder ?? -1) + 1;

    const row = await prisma.personalInstructorContact.create({
      data: {
        ownerId: userId,
        displayName,
        title: title || null,
        organization: organization || null,
        expertiseDomains: expertiseDomains || null,
        email: email || null,
        lineId: lineId || null,
        address: address || null,
        phone: phone || null,
        notes: notes || null,
        sortOrder: nextOrder,
      },
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
    console.error("[POST /api/personal-instructor-contacts]", e);
    return NextResponse.json({ error: "建立失敗" }, { status: 500 });
  }
}
