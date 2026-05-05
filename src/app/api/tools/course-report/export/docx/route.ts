/**
 * 【課程規劃報告產生器 - 匯出制式 DOCX】
 *
 * POST /api/tools/course-report/export/docx
 *   Body: { report: CourseReport }
 *   回傳：DOCX binary（attachment）
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { toDocxStructured } from "@/lib/course-report-generator/lib/export/toDocxStructured";
import { getPalette } from "@/lib/course-report-generator/lib/palettes";
import type { CourseReport } from "@/lib/course-report-generator/types/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未授權" }, { status: 401 });

  let body: { report?: CourseReport };
  try {
    body = (await req.json()) as { report?: CourseReport };
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }
  const report = body.report;
  if (!report || !report.schemaVersion) {
    return NextResponse.json({ error: "缺少或不正確的 report" }, { status: 400 });
  }
  const palette = getPalette(report.paletteId);

  try {
    const buf = await toDocxStructured({ report, palette });
    const filename = (report.title || "課程規劃報告").replace(/[<>:"/\\|?*]/g, "_").slice(0, 60);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.docx`,
      },
    });
  } catch (err) {
    console.error("[course-report export/docx] 失敗：", err);
    const msg = err instanceof Error ? err.message : "未知錯誤";
    return NextResponse.json({ error: `DOCX 匯出失敗：${msg}` }, { status: 500 });
  }
}
