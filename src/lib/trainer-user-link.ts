/**
 * 【培訓師名冊 ↔ 登入帳號綁定】
 * 維護 Trainer.linkedUserId；同一 User 僅能綁定一筆 Trainer（資料庫 unique + 事前檢查）。
 */
import { prisma } from "@/lib/prisma";

export type LinkTrainerUserResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

/**
 * 將名冊列綁定至培訓師帳號，或解除綁定（linkedUserId = null）。
 * 僅允許 role === trainer 的 User 被綁定。
 */
export async function setTrainerLinkedUser(
  trainerId: string,
  linkedUserId: string | null
): Promise<LinkTrainerUserResult> {
  const trainer = await prisma.trainer.findUnique({ where: { id: trainerId } });
  if (!trainer) {
    return { ok: false, error: "找不到培訓師名冊列", status: 404 };
  }

  if (linkedUserId === null) {
    await prisma.trainer.update({
      where: { id: trainerId },
      data: { linkedUserId: null },
    });
    return { ok: true };
  }

  const user = await prisma.user.findUnique({ where: { id: linkedUserId } });
  if (!user) {
    return { ok: false, error: "找不到使用者", status: 404 };
  }
  if (user.role !== "trainer") {
    return { ok: false, error: "僅能綁定角色為「培訓師」的登入帳號", status: 400 };
  }

  // 同一 User 僅能出現在一筆名冊：改綁至本列時，先解除其他列上的相同帳號
  await prisma.trainer.updateMany({
    where: { linkedUserId, NOT: { id: trainerId } },
    data: { linkedUserId: null },
  });

  await prisma.trainer.update({
    where: { id: trainerId },
    data: { linkedUserId },
  });
  return { ok: true };
}

/** 解除「某使用者」在所有名冊列上的綁定（使用者導向操作） */
export async function clearTrainerLinksForUser(userId: string): Promise<void> {
  await prisma.trainer.updateMany({
    where: { linkedUserId: userId },
    data: { linkedUserId: null },
  });
}
