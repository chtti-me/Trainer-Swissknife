/**
 * 【課程規劃報告產生器 - 解析上傳檔案】
 *
 * POST /api/tools/course-report/parse-uploads
 *   - multipart/form-data
 *     - file: File
 *
 *   - 回傳 { text: string, ext: string, filename: string }
 *
 * 圖片不在這裡處理（前端會直接以 base64 帶到 ai/extract，由多模態 LLM 看圖）。
 * 這條路由只處理 docx / pdf / txt / xlsx / csv / html / htm。
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { parseUploadToText } from "@/lib/course-planner/upload-parser";
import { getExt } from "@/lib/course-report-generator/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

/** 從 HTML 字串簡易抽出主要文字（去除 <script>/<style>，把標籤剝掉） */
function htmlToText(html: string): string {
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const text = noScript.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "請使用 multipart/form-data 上傳" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少 file 欄位" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `檔案過大（上限 ${MAX_BYTES / 1024 / 1024} MB）` }, { status: 413 });
  }

  const ext = getExt(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    if (ext === "html" || ext === "htm") {
      const html = buffer.toString("utf8");
      const text = htmlToText(html);
      if (!text) {
        return NextResponse.json({ error: "HTML 檔內無可解析文字" }, { status: 400 });
      }
      return NextResponse.json({ text, ext, filename: file.name });
    }
    const result = await parseUploadToText({
      filename: file.name,
      mimeType: file.type,
      buffer,
    });
    return NextResponse.json({ text: result.text, ext: result.ext, filename: file.name });
  } catch (err) {
    console.error("[course-report parse-uploads] 失敗：", err);
    const msg = err instanceof Error ? err.message : "未知錯誤";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
