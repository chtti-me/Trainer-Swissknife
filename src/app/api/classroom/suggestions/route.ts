/**
 * 【教室建議 API】POST：DEMO 或帶 TIS session 產生建議列表。
 */
import { NextResponse } from "next/server";
import { getClassroomSession } from "@/lib/classroom/session-store";
import {
  getClassroomSuggestionsFromTis,
  getDemoClassroomSuggestions,
  validateTisSession,
  type DemoCampusProfile,
} from "@/lib/classroom/tis";

function requireString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sessionToken = requireString(body?.sessionToken);
    const department = requireString(body?.department);
    const building = requireString(body?.building);
    const date = requireString(body?.date);
    const timeStart = requireString(body?.timeStart);
    const timeEnd = requireString(body?.timeEnd);
    const attendees = Number(body?.attendees || 0);
    const classroomTypes = Array.isArray(body?.classroomTypes) ? body.classroomTypes.map((v: unknown) => String(v)) : [];
    const requiredFeatures = Array.isArray(body?.requiredFeatures) ? body.requiredFeatures.map((v: unknown) => String(v)) : [];
    const demoProfile = requireString(body?.demoProfile) as DemoCampusProfile | "";

    if (!department || !building || !date || !timeStart || !timeEnd) {
      return NextResponse.json({ error: "CLASSROOM_BAD_REQUEST", message: "必要欄位不足" }, { status: 400 });
    }

    // DEMO（展示）模式：允許不提供 session（工作階段）。
    if (!sessionToken && demoProfile) {
      const demo = getDemoClassroomSuggestions(demoProfile, {
        department,
        building,
        date,
        timeStart,
        timeEnd,
        attendees: Number.isFinite(attendees) ? attendees : 0,
        classroomTypes,
        requiredFeatures,
      });
      return NextResponse.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        suggestions: demo.suggestions,
        debug: {
          candidateCount: demo.candidateCount,
          excludedCount: 0,
          mode: "demo",
          profile: demoProfile,
        },
      });
    }

    if (!sessionToken) {
      return NextResponse.json({ error: "CLASSROOM_SESSION_MISSING", message: "請提供 session（工作階段）或選擇 DEMO 測試情境" }, { status: 400 });
    }

    const session = getClassroomSession(sessionToken);
    if (!session) {
      return NextResponse.json({ error: "CLASSROOM_SESSION_MISSING", message: "session（工作階段）不存在或已過期" }, { status: 404 });
    }

    const tisValid = await validateTisSession(session.sessionId);
    if (!tisValid) {
      return NextResponse.json({ error: "TIS_SESSION_EXPIRED", message: "TIS session（工作階段）已失效，請重新提供" }, { status: 401 });
    }

    const result = await getClassroomSuggestionsFromTis(session.sessionId, {
      department,
      building,
      date,
      timeStart,
      timeEnd,
      attendees: Number.isFinite(attendees) ? attendees : 0,
      classroomTypes,
      requiredFeatures,
    });

    if (result.suggestions.length === 0) {
      return NextResponse.json({
        ok: false,
        error: "NO_SUGGESTION_FOUND",
        message: "查無符合條件教室，建議放寬條件後再試",
        suggestions: [],
        debug: { candidateCount: result.candidateCount, excludedCount: result.candidateCount },
      });
    }

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      suggestions: result.suggestions,
      debug: {
        candidateCount: result.candidateCount,
        excludedCount: Math.max(0, result.candidateCount - result.suggestions.length),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "INTERNAL_ERROR";
    if (message === "TIS_SESSION_EXPIRED") {
      return NextResponse.json({ error: "TIS_SESSION_EXPIRED", message: "TIS session（工作階段）已失效，請重新提供" }, { status: 401 });
    }
    if (message === "TIS_FETCH_FAILED") {
      return NextResponse.json({ error: "TIS_FETCH_FAILED", message: "TIS 連線失敗，請稍後重試" }, { status: 502 });
    }
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "產生教室建議失敗" }, { status: 500 });
  }
}

