/**
 * 【TIS HTML 同步：dry-run】POST
 *
 * 接收一份或多份 TIS 開班計畫表 HTML（multipart files 或 JSON 陣列），
 * 解析後與 DB 比對，回 dry-run diff。**不寫入 DB**。
 *
 * Body 形式（擇一）：
 *   - multipart/form-data：欄位名 `files`，可多檔
 *   - application/json：{ "htmls": [{ name, content }, ...] }
 *
 * 回傳：
 *   {
 *     parsedSummary: { totalPages, totalRowsParsed, totalDuplicatesAcrossPages, pages: [...] },
 *     diff: SyncDiff
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { parseManyTisHtml } from "@/lib/tis/sync-parser";
import { computeDiff } from "@/lib/tis/sync-applier";

export const dynamic = "force-dynamic";

interface JsonBody {
  htmls?: Array<{ name?: string; content?: string }>;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") || "";
  const sources: Array<{ name: string; content: string }> = [];

  try {
    if (contentType.startsWith("multipart/form-data")) {
      const fd = await req.formData();
      const files = fd.getAll("files");
      for (const f of files) {
        if (f instanceof File) {
          const text = await f.text();
          sources.push({ name: f.name, content: text });
        }
      }
    } else if (contentType.startsWith("application/json")) {
      const body = (await req.json()) as JsonBody;
      for (const h of body.htmls ?? []) {
        if (typeof h?.content === "string" && h.content.length > 0) {
          sources.push({
            name: typeof h.name === "string" ? h.name : "(unnamed)",
            content: h.content,
          });
        }
      }
    } else {
      return NextResponse.json(
        { error: `不支援的 Content-Type: ${contentType}` },
        { status: 400 }
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: `讀取上傳資料失敗：${e instanceof Error ? e.message : String(e)}` },
      { status: 400 }
    );
  }

  if (sources.length === 0) {
    return NextResponse.json({ error: "未收到任何 HTML" }, { status: 400 });
  }

  // 過濾掉明顯不像 TIS 開班計畫表的 HTML（避免使用者亂上傳東西）
  const tisLike = sources.filter((s) => /OpenClass_ClassList2|開班計畫表/.test(s.content));
  const skipped = sources.length - tisLike.length;

  if (tisLike.length === 0) {
    return NextResponse.json(
      {
        error:
          "上傳的 HTML 都不像 TIS 開班計畫表頁面（找不到 OpenClass_ClassList2 或「開班計畫表」字樣）",
      },
      { status: 400 }
    );
  }

  const parsed = parseManyTisHtml(tisLike.map((s) => s.content));
  const allClasses = parsed.mergedClasses;

  let diff;
  try {
    diff = await computeDiff(allClasses);
  } catch (e) {
    return NextResponse.json(
      {
        error: `比對 DB 失敗：${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    parsedSummary: {
      totalPages: parsed.totalPages,
      totalRowsParsed: parsed.totalRowsParsed,
      totalDuplicatesAcrossPages: parsed.totalDuplicatesAcrossPages,
      skipped,
      pages: parsed.pages.map((p, i) => ({
        sourceName: tisLike[i]?.name ?? null,
        yy: p.yy,
        mm: p.mm,
        department: p.department,
        pageTitle: p.pageTitle,
        loginUser: p.loginUser,
        classCount: p.classes.length,
        warnings: p.warnings,
      })),
    },
    diff,
  });
}
