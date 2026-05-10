import "server-only";

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * 確保指定使用者有一組 TIS bookmarklet 個人 token。
 *
 * 為什麼需要這個 token？
 *   TIS bookmarklet 從 tis.cht.com.tw 對 trainer-swissknife.onrender.com
 *   發送 cross-site form POST。next-auth cookie 預設 SameSite=Lax，
 *   瀏覽器在「跨站 POST」場景下 **不會** 帶該 cookie（Lax 只允許 cross-site GET top-level navigation）。
 *   所以 receive endpoint 收不到 session，必然回 401。
 *
 *   解法：每個 user 配發一組 64-char hex random token，存在 user.bookmarkletToken。
 *   bookmarklet 把 token 包進 form 的 hidden input，receive 用 token 反查 user，
 *   完全不依賴 cookie。這也讓「個人化的 bookmarklet」自然成立 —
 *   每個人拿到的書籤 URL 不同，匯入紀錄會掛在自己身上。
 */
export async function ensureBookmarkletToken(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { bookmarkletToken: true },
  });
  if (u?.bookmarkletToken) return u.bookmarkletToken;
  const token = randomBytes(32).toString("hex"); // 64 char hex
  await prisma.user.update({
    where: { id: userId },
    data: { bookmarkletToken: token },
  });
  return token;
}

/**
 * 強制重新產生一組新的 token，舊 bookmarklet 立即失效。
 * 用於：使用者懷疑 bookmarklet URL 被別人偷拷貝時。
 */
export async function rotateBookmarkletToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: userId },
    data: { bookmarkletToken: token },
  });
  return token;
}

/**
 * 用 token 反查 user id。找不到回 null。
 * 不帶 password / 其他敏感欄位。
 */
export async function findUserByBookmarkletToken(token: string): Promise<{ id: string } | null> {
  if (!token || typeof token !== "string" || token.length < 32) return null;
  const u = await prisma.user.findUnique({
    where: { bookmarkletToken: token },
    select: { id: true },
  });
  return u;
}
