/**
 * 【教室模組 Session】POST 建立、DELETE 撤銷本系統 classroom token。
 */
import { NextResponse } from "next/server";
import { createClassroomSession, getSessionTtlSeconds, revokeClassroomSession } from "@/lib/classroom/session-store";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sessionId = (body?.sessionId || "").trim();
    if (!sessionId) {
      return NextResponse.json({ error: "CLASSROOM_SESSION_MISSING", message: "缺少 session（工作階段）資料" }, { status: 400 });
    }

    const record = createClassroomSession(sessionId);
    return NextResponse.json({
      ok: true,
      sessionToken: record.token,
      expiresAt: record.expiresAt.toISOString(),
      ttlSeconds: getSessionTtlSeconds(record),
    });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "建立 session（工作階段）失敗" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const token = (body?.sessionToken || "").trim();
    if (!token) {
      return NextResponse.json({ error: "CLASSROOM_BAD_REQUEST", message: "缺少 sessionToken（工作階段權杖）" }, { status: 400 });
    }
    const ok = revokeClassroomSession(token);
    if (!ok) {
      return NextResponse.json({ error: "CLASSROOM_SESSION_MISSING", message: "找不到可失效的 session（工作階段）" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "失效 session（工作階段）失敗" }, { status: 500 });
  }
}

