/**
 * 【管理員：單一使用者】PATCH、DELETE；需 admin 角色。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { campusFromTrainerUnit, TRAINER_UNITS } from "@/lib/user-organization";
import { clearTrainerLinksForUser, setTrainerLinkedUser } from "@/lib/trainer-user-link";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error, session } = await requireAdminSession();
  if (error) return error;

  const { id } = await ctx.params;
  let body: {
    name?: string;
    email?: string;
    password?: string | null;
    department?: string | null;
    role?: string;
    /** 對應名冊 Trainer.id；null 為解除綁定；略過則不變更 */
    linkedTrainerId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "無效的 JSON" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "找不到使用者" }, { status: 404 });
  }

  const name = body.name !== undefined ? String(body.name).trim() : undefined;
  const email = body.email !== undefined ? String(body.email).trim().toLowerCase() : undefined;
  const password =
    body.password !== undefined
      ? String(body.password).trim()
      : undefined;
  const department =
    body.department !== undefined
      ? body.department
        ? String(body.department).trim()
        : null
      : undefined;
  const role = body.role !== undefined ? String(body.role).trim() : undefined;

  if (name !== undefined && !name) {
    return NextResponse.json({ error: "姓名不可為空" }, { status: 400 });
  }
  if (email !== undefined && !email) {
    return NextResponse.json({ error: "電子郵件不可為空" }, { status: 400 });
  }

  if (
    department !== undefined &&
    department !== null &&
    department !== "" &&
    !TRAINER_UNITS.includes(department as (typeof TRAINER_UNITS)[number])
  ) {
    return NextResponse.json({ error: "單位必須為預設清單之一" }, { status: 400 });
  }

  if (role !== undefined && !["trainer", "admin"].includes(role)) {
    return NextResponse.json({ error: "角色無效" }, { status: 400 });
  }

  const campus =
    department !== undefined ? campusFromTrainerUnit(department) : undefined;

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (email !== undefined) data.email = email;
  if (password !== undefined && password.length > 0) data.password = password;
  if (department !== undefined) data.department = department;
  if (role !== undefined) data.role = role;
  if (campus !== undefined) data.campus = campus;

  const selfId = (session!.user as { id?: string }).id;
  if (role !== undefined && existing.role === "admin" && role !== "admin") {
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: "至少需要保留一位系統管理員" }, { status: 400 });
    }
  }
  if (id === selfId && role !== undefined && role !== "admin") {
    return NextResponse.json({ error: "不可撤銷自己的管理員權限" }, { status: 400 });
  }

  const finalRoleBefore = role !== undefined ? role : existing.role;
  if (
    body.linkedTrainerId !== undefined &&
    body.linkedTrainerId !== null &&
    String(body.linkedTrainerId).trim() !== "" &&
    finalRoleBefore !== "trainer"
  ) {
    return NextResponse.json({ error: "僅「培訓師」角色可綁定名冊列" }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data,
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

    if (user.role !== "trainer") {
      await clearTrainerLinksForUser(id);
    } else if (body.linkedTrainerId !== undefined) {
      if (body.linkedTrainerId === null || body.linkedTrainerId === "") {
        await clearTrainerLinksForUser(id);
      } else {
        const link = await setTrainerLinkedUser(String(body.linkedTrainerId).trim(), id);
        if (!link.ok) {
          return NextResponse.json({ error: link.error }, { status: link.status });
        }
      }
    }

    const trainerRow = await prisma.trainer.findFirst({
      where: { linkedUserId: id },
      select: { id: true, name: true },
    });

    return NextResponse.json({ ...user, linkedTrainer: trainerRow });
  } catch (e: unknown) {
    const dup = e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002";
    return NextResponse.json({ error: dup ? "此電子郵件已被使用" : "更新失敗" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { error, session } = await requireAdminSession();
  if (error) return error;

  const { id } = await ctx.params;
  const selfId = (session!.user as { id?: string }).id;
  if (id === selfId) {
    return NextResponse.json({ error: "不可刪除目前登入中的帳號" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "找不到使用者" }, { status: 404 });
  }

  if (target.role === "admin") {
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: "至少需要保留一位系統管理員" }, { status: 400 });
    }
  }

  await prisma.$transaction([
    prisma.coursePlanDraft.deleteMany({
      where: {
        OR: [{ createdBy: id }, { request: { createdBy: id } }],
      },
    }),
    prisma.coursePlanSkillRun.deleteMany({
      where: { request: { createdBy: id } },
    }),
    prisma.coursePlanRequest.deleteMany({ where: { createdBy: id } }),
    prisma.similarityCheck.deleteMany({ where: { createdBy: id } }),
    prisma.trainingClass.updateMany({ where: { trainerUserId: id }, data: { trainerUserId: null } }),
    prisma.user.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
