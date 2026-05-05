/**
 * 課程規劃幫手 — 檔案上傳解析
 *  POST /api/course-planner/upload-parse  multipart/form-data，欄位 file
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { parseUploadToText } from "@/lib/course-planner/upload-parser";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "請上傳檔案（file）" }, { status: 400 });
    }
    if (file.size <= 0) return NextResponse.json({ error: "檔案為空" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "檔案過大（上限 10MB）" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseUploadToText({
      filename: file.name,
      mimeType: file.type,
      buffer,
    });
    const lines = parsed.text.split(/\r?\n/).filter((x) => x.trim());
    return NextResponse.json({
      filename: file.name,
      ext: parsed.ext,
      text: parsed.text,
      stats: {
        charCount: parsed.text.length,
        lineCount: lines.length,
        paragraphCount: parsed.text.split(/\n\s*\n/).filter((x) => x.trim()).length,
      },
    });
  } catch (error) {
    console.error("[course-planner upload-parse]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "檔案解析失敗" },
      { status: 400 },
    );
  }
}
