/**
 * 【管理員：使用者列表／新增】GET、POST；需 admin 角色。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { campusFromTrainerUnit, TRAINER_UNITS } from "@/lib/user-organization";
import { setTrainerLinkedUser } from "@/lib/trainer-user-link";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  const users = await prisma.user.findMany({
    orderBy: [{ campus: "asc" }, { department: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      department: true,
      role: true,
      campus: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const links = await prisma.trainer.findMany({
    where: { linkedUserId: { not: null } },
    select: { id: true, name: true, linkedUserId: true },
  });
  const userIdToTrainer = new Map(
    links
      .filter((l): l is (typeof l & { linkedUserId: string }) => l.linkedUserId != null)
      .map((l) => [l.linkedUserId, { id: l.id, name: l.name }])
  );

  return NextResponse.json(
    users.map((u) => ({
      ...u,
      linkedTrainer: userIdToTrainer.get(u.id) ?? null,
    }))
  );
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  let body: {
    name?: string;
    email?: string;
    password?: string;
    department?: string | null;
    role?: string;
    /** 建立後綁定至該名冊列（僅培訓師帳號可綁定成功） */
    linkedTrainerId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "無效的 JSON" }, { status: 400 });
  }

  const name = (body.name || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const password = (body.password || "").trim();
  const department = (body.department || "").trim() || null;
  const role = (body.role || "trainer").trim();

  if (!name || !email || !password) {
    return NextResponse.json({ error: "姓名、電子郵件與密碼為必填" }, { status: 400 });
  }

  if (!department) {
    return NextResponse.json({ error: "請選擇單位" }, { status: 400 });
  }

  if (!TRAINER_UNITS.includes(department as (typeof TRAINER_UNITS)[number])) {
    return NextResponse.json({ error: "單位必須為預設清單之一" }, { status: 400 });
  }

  if (!["trainer", "admin"].includes(role)) {
    return NextResponse.json({ error: "角色無效" }, { status: 400 });
  }

  const linkedTrainerIdRaw =
    body.linkedTrainerId != null && String(body.linkedTrainerId).trim() !== ""
      ? String(body.linkedTrainerId).trim()
      : null;
  if (linkedTrainerIdRaw && role !== "trainer") {
    return NextResponse.json({ error: "僅「培訓師」角色可綁定名冊列" }, { status: 400 });
  }

  const campus = campusFromTrainerUnit(department);

  try {
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password,
        department,
        role,
        campus,
      },
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        role: true,
        campus: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (linkedTrainerIdRaw) {
      const link = await setTrainerLinkedUser(linkedTrainerIdRaw, user.id);
      if (!link.ok) {
        await prisma.user.delete({ where: { id: user.id } });
        return NextResponse.json({ error: link.error }, { status: link.status });
      }
    }

    const trainerRow = await prisma.trainer.findFirst({
      where: { linkedUserId: user.id },
      select: { id: true, name: true },
    });

    return NextResponse.json({ ...user, linkedTrainer: trainerRow });
  } catch (e: unknown) {
    const msg = e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002"
      ? "此電子郵件已被使用"
      : "建立失敗";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
