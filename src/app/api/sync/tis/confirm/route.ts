/**
 * 【TIS HTML 同步：confirm】POST
 *
 * 接收 ingest 階段回傳的 diff（或重新 parse 後的 SyncDiff），執行 upsert + 記 SyncJob。
 *
 * Body：
 *   {
 *     "htmls": [{ name, content }, ...]   // 與 ingest 一致；後端會重新 parse + diff（不信任前端傳來的 diff）
 *   }
 *
 * 為什麼要重新 parse 而不直接用前端傳來的 diff？
 *   - 安全：前端 diff 可能被竄改，不該直接寫入 DB
 *   - 一致：避免 ingest → confirm 之間 DB 已被別人改動造成 diff 過期；重新計算最準
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { parseManyTisHtml } from "@/lib/tis/sync-parser";
import { applyDiff, computeDiff } from "@/lib/tis/sync-applier";

export const dynamic = "force-dynamic";

interface Body {
  htmls?: Array<{ name?: string; content?: string }>;
  /** 給 SyncJob.sourceName 用的識別字（UI 可帶過來） */
  sourceLabel?: string;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body 不是合法 JSON" }, { status: 400 });
  }

  const sources = (body.htmls ?? [])
    .filter((h) => typeof h?.content === "string" && (h.content as string).length > 0)
    .map((h) => ({ name: typeof h.name === "string" ? h.name : "(unnamed)", content: h.content as string }));

  const tisLike = sources.filter((s) => /OpenClass_ClassList2|開班計畫表/.test(s.content));
  if (tisLike.length === 0) {
    return NextResponse.json({ error: "沒有可用的 TIS HTML 內容" }, { status: 400 });
  }

  const parsed = parseManyTisHtml(tisLike.map((s) => s.content));
  const diff = await computeDiff(parsed.mergedClasses);

  const sourceName =
    body.sourceLabel?.trim() ||
    `TIS HTML 上傳：${tisLike.length} 檔、共 ${parsed.totalRowsParsed} 班 (${tisLike[0]?.name})`;

  const result = await applyDiff(diff, { sourceName });
  return NextResponse.json(result);
}
