import "server-only";
import type { Session } from "next-auth";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth";

/**
 * 讀取 server session；若 cookie 是用舊的 NEXTAUTH_SECRET 簽的（或正式站 cookie 帶到本機），
 * 視為未登入，避免 JWT 解密失敗噴錯或觸發 Next.js 開發錯誤遮罩。
 */
export async function getServerSessionSafe(): Promise<Session | null> {
  try {
    return await getServerSession(authOptions);
  } catch {
    return null;
  }
}
