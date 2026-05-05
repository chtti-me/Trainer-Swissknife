/**
 * 課程規劃幫手 — 匯出
 *  POST /api/course-planner/requests/[id]/export
 *  Body: { format: "markdown" | "html" | "json" | "docx" }
 *
 * 回傳對應 Content-Type 的檔案附件。
 * docx 模式採 HTML + application/msword MIME（Word 可直接開啟）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  toHtml,
  toJson,
  toMarkdown,
  type ExportSource,
} from "@/lib/course-planner/exporters";
import {
  CoursePlanFormSchema,
  AuxiliaryDocsSchema,
  emptyAuxiliaryDocs,
  type CoursePlanForm,
  type AuxiliaryDocs,
} from "@/lib/course-planner/schemas/form";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const { id } = await params;

  const request = await prisma.coursePlanRequest.findFirst({
    where: { id, createdBy: userId },
    select: { id: true, title: true, rawInputText: true, finalForm: true, finalAuxDocs: true },
  });
  if (!request) return NextResponse.json({ error: "找不到規劃需求" }, { status: 404 });
  if (!request.finalForm) {
    return NextResponse.json({ error: "尚未產出最終開班計畫表，無法匯出" }, { status: 400 });
  }

  let formParsed: CoursePlanForm;
  try {
    formParsed = CoursePlanFormSchema.parse(request.finalForm);
  } catch (e) {
    return NextResponse.json({ error: `儲存的 form 格式異常：${(e as Error).message}` }, { status: 500 });
  }
  let auxParsed: AuxiliaryDocs = emptyAuxiliaryDocs();
  if (request.finalAuxDocs) {
    try {
      auxParsed = AuxiliaryDocsSchema.parse(request.finalAuxDocs);
    } catch {
      // 容錯：解析不出就用空殼
    }
  }

  const body = (await req.json().catch(() => ({}))) as { format?: string };
  const format = (body.format || "markdown").toLowerCase();

  const source: ExportSource = {
    title: request.title,
    rawInputText: request.rawInputText,
    form: formParsed,
    auxDocs: auxParsed,
  };

  const baseName = (formParsed.aiFilled.topic || request.title || "course-plan")
    .replace(/[<>:"/\\|?*]/g, "_")
    .slice(0, 60);

  if (format === "markdown" || format === "md") {
    return new NextResponse(toMarkdown(source), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(baseName)}.md"`,
      },
    });
  }
  if (format === "html") {
    return new NextResponse(toHtml(source), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(baseName)}.html"`,
      },
    });
  }
  if (format === "json") {
    return new NextResponse(toJson(source), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(baseName)}.json"`,
      },
    });
  }
  if (format === "docx") {
    // Word 可直接開啟附 application/msword MIME 的 HTML 檔
    return new NextResponse(toHtml(source), {
      headers: {
        "Content-Type": "application/msword; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(baseName)}.doc"`,
      },
    });
  }

  return NextResponse.json(
    { error: `不支援的格式：${format}（僅支援 markdown / html / json / docx）` },
    { status: 400 },
  );
}
