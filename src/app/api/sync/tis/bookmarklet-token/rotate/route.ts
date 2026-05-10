/**
 * 【TIS Bookmarklet Token 重置】POST
 *
 * 強制重新產生當前使用者的 bookmarklet token。
 * 用途：使用者懷疑書籤 URL 被別人偷拷貝（內含舊 token）→ 點此按鈕讓舊 bookmarklet 立即失效。
 * 之後使用者必須回 /settings 重新拖一次新書籤到書籤列。
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rotateBookmarkletToken } from "@/lib/tis/bookmarklet-token";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }
  await rotateBookmarkletToken(userId);
  return NextResponse.json({ ok: true });
}
