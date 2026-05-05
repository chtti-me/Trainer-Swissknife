/**
 * 【課程規劃報告產生器 - server fetch URL】
 *
 * POST /api/tools/course-report/fetch-url
 *   Body: { url: string, cookie?: string }
 *
 *   回傳 { text: string, title: string, url: string }
 *
 * 用於抓取 TIS 開班計畫表這類需登入頁面，由 server 代為下載 HTML，
 * 抽取主要文字後回給前端，避開瀏覽器 CORS。
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return (m?.[1] || "").trim();
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  let body: { url?: string; cookie?: string };
  try {
    body = (await req.json()) as { url?: string; cookie?: string };
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }
  const url = (body.url || "").trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "請提供 http(s) URL" }, { status: 400 });
  }

  try {
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) TrainerSwissKnife/CourseReport (+server-side fetch)",
      Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
    };
    if (body.cookie) headers.Cookie = body.cookie;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 20000);
    let res: Response;
    try {
      res = await fetch(url, { headers, signal: controller.signal, redirect: "follow" });
    } finally {
      clearTimeout(t);
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: `抓取失敗：HTTP ${res.status} ${res.statusText}` },
        { status: 400 }
      );
    }
    const html = await res.text();
    const text = htmlToText(html);
    const title = extractTitle(html);
    if (!text) {
      return NextResponse.json({ error: "頁面無文字內容（可能需登入）" }, { status: 400 });
    }
    return NextResponse.json({ text: text.slice(0, 50000), title, url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知錯誤";
    console.error("[course-report fetch-url] 失敗：", err);
    return NextResponse.json({ error: `抓取失敗：${msg}` }, { status: 500 });
  }
}
