/**
 * 【教室模組 Session 驗證】POST：用 TIS 實際連線檢查 cookie 是否仍有效。
 */
import { NextResponse } from "next/server";
import { getClassroomSession, touchClassroomSessionValidated } from "@/lib/classroom/session-store";
import { validateTisSession } from "@/lib/classroom/tis";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = (body?.sessionToken || "").trim();
    if (!token) {
      return NextResponse.json({ error: "CLASSROOM_BAD_REQUEST", message: "缺少 sessionToken（工作階段權杖）" }, { status: 400 });
    }

    const record = getClassroomSession(token);
    if (!record) {
      return NextResponse.json({ error: "CLASSROOM_SESSION_MISSING", message: "session（工作階段）不存在或已過期" }, { status: 404 });
    }

    const valid = await validateTisSession(record.sessionId);
    if (valid) {
      touchClassroomSessionValidated(token);
    }

    return NextResponse.json({
      ok: true,
      tisSessionValid: valid,
      message: valid ? "session valid" : "TIS session invalid",
    });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "驗證 session（工作階段）失敗" }, { status: 500 });
  }
}

