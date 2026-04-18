/**
 * 【管理員：培訓師名冊列】PATCH：綁定／解除綁定登入帳號（Trainer.linkedUserId）。
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { setTrainerLinkedUser } from "@/lib/trainer-user-link";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const { id: trainerId } = await ctx.params;

  let body: { linkedUserId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "無效的 JSON" }, { status: 400 });
  }

  if (!("linkedUserId" in body)) {
    return NextResponse.json({ error: "請提供 linkedUserId（字串或 null）" }, { status: 400 });
  }

  const linkedUserId =
    body.linkedUserId === null || body.linkedUserId === ""
      ? null
      : String(body.linkedUserId).trim();

  const result = await setTrainerLinkedUser(trainerId, linkedUserId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
