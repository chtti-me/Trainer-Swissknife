/**
 * 精簡版課程規劃幫手 - 匯出 API
 * POST：將課程規劃結果匯出為 Markdown / HTML / JSON
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { CoursePlanInput, CoursePlanResult, CourseModule, InstructorSuggestion } from "@/lib/planning/types";

function escapeHtml(s: string | undefined | null): string {
  if (s == null || s === "") return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isoToZhNote(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  } catch {
    return iso;
  }
}

interface ExportData {
  result?: CoursePlanResult;
  input?: CoursePlanInput;
}

function generateMarkdown(data: ExportData): string {
  const result = data.result;
  if (!result) return "# 無資料\n";

  const exportAt = new Date().toISOString();
  const lines: string[] = [];

  lines.push(`# ${result.suggestedTitle}`);
  lines.push("");
  lines.push("## 產出與免責聲明");
  lines.push("");
  lines.push(`- **本檔產出時間**：${isoToZhNote(exportAt)}（ISO：${exportAt}）`);
  lines.push("- **說明**：本檔由「培訓師瑞士刀」課程規劃幫手自動產生，**非**中華電信學院正式核可文件；送簽核、對外承諾或開班前仍須依院內程序覆核。");
  lines.push("");

  lines.push("## 課程基本資訊");
  lines.push("");
  lines.push("| 項目 | 內容 |");
  lines.push("| --- | --- |");
  lines.push(`| 建議班名 | ${result.suggestedTitle} |`);
  lines.push(`| 目標 | ${result.objective} |`);
  lines.push(`| 對象 | ${result.targetAudience} |`);
  lines.push(`| 預備知識 | ${result.prerequisites} |`);
  lines.push(`| 總時數 | ${result.totalHours} 小時 |`);
  lines.push("");

  lines.push("## 課程模組");
  lines.push("");
  lines.push("| 課程名稱 | 時數 |");
  lines.push("| --- | --- |");
  result.modules.forEach((m) => {
    lines.push(`| ${m.name} | ${m.hours} hr |`);
  });
  lines.push("");

  lines.push("## 建議講師人選");
  lines.push("");
  lines.push("| 講師姓名 | 教學領域 | 來源 |");
  lines.push("| --- | --- | --- |");
  result.instructors.forEach((inst) => {
    const sourceLabel = inst.source === "web_search" ? "網路搜尋" : "AI 推薦";
    lines.push(`| ${inst.name} | ${inst.expertise} | ${sourceLabel} |`);
  });
  lines.push("");

  if (result.instructors.some((i) => i.source === "ai_recommendation")) {
    lines.push("> ※ AI 推薦的講師人選僅供參考，建議人工查證實際資歷");
    lines.push("");
  }

  if (data.input?.requirementText) {
    lines.push("## 原始培訓需求");
    lines.push("");
    lines.push("```");
    lines.push(data.input.requirementText.slice(0, 3000));
    lines.push("```");
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("*此草案由培訓師瑞士刀課程規劃幫手產生，供討論參考使用；非學院正式核可文件。*");

  return lines.join("\n");
}

function generateHtml(data: ExportData): string {
  const result = data.result;
  if (!result) return "<!DOCTYPE html><html><body><p>無資料</p></body></html>";

  const exportAt = new Date().toISOString();
  const title = escapeHtml(result.suggestedTitle);
  const lines: string[] = [];

  lines.push("<!DOCTYPE html>");
  lines.push('<html lang="zh-Hant">');
  lines.push("<head>");
  lines.push('<meta charset="utf-8" />');
  lines.push('<meta name="viewport" content="width=device-width, initial-scale=1" />');
  lines.push(`<title>${title}</title>`);
  lines.push("<style>");
  lines.push("body{font-family:system-ui,-apple-system,sans-serif;line-height:1.6;max-width:48rem;margin:2rem auto;padding:0 1rem;color:#1f2937}");
  lines.push("h1{font-size:1.75rem;color:#111827;border-bottom:2px solid #3b82f6;padding-bottom:0.5rem}");
  lines.push("h2{font-size:1.25rem;margin-top:1.5rem;color:#374151}");
  lines.push("table{border-collapse:collapse;width:100%;margin:1rem 0}");
  lines.push("th,td{border:1px solid #e5e7eb;padding:0.5rem 0.75rem;text-align:left}");
  lines.push("th{background:#f9fafb;font-weight:600}");
  lines.push(".info-table td:first-child{width:100px;font-weight:600;background:#f9fafb}");
  lines.push(".badge{display:inline-block;padding:0.125rem 0.5rem;border-radius:9999px;font-size:0.75rem;font-weight:500}");
  lines.push(".badge-web{background:#d1fae5;color:#065f46}");
  lines.push(".badge-ai{background:#dbeafe;color:#1e40af}");
  lines.push(".muted{color:#6b7280;font-size:0.875rem}");
  lines.push("footer{margin-top:2rem;padding-top:1rem;border-top:1px solid #e5e7eb;font-size:0.8rem;color:#6b7280}");
  lines.push("</style>");
  lines.push("</head><body>");

  lines.push(`<h1>${title}</h1>`);

  lines.push("<h2>產出與免責聲明</h2>");
  lines.push("<ul>");
  lines.push(`<li><strong>本檔產出時間</strong>：${escapeHtml(isoToZhNote(exportAt))}</li>`);
  lines.push("<li><strong>說明</strong>：本檔由培訓師瑞士刀課程規劃幫手自動產生，<strong>非</strong>中華電信學院正式核可文件。</li>");
  lines.push("</ul>");

  lines.push("<h2>課程基本資訊</h2>");
  lines.push('<table class="info-table">');
  lines.push(`<tr><td>建議班名</td><td>${escapeHtml(result.suggestedTitle)}</td></tr>`);
  lines.push(`<tr><td>目標</td><td>${escapeHtml(result.objective)}</td></tr>`);
  lines.push(`<tr><td>對象</td><td>${escapeHtml(result.targetAudience)}</td></tr>`);
  lines.push(`<tr><td>預備知識</td><td>${escapeHtml(result.prerequisites)}</td></tr>`);
  lines.push(`<tr><td>總時數</td><td>${result.totalHours} 小時</td></tr>`);
  lines.push("</table>");

  lines.push("<h2>課程模組</h2>");
  lines.push("<table>");
  lines.push("<thead><tr><th>課程名稱</th><th style=\"width:80px\">時數</th></tr></thead>");
  lines.push("<tbody>");
  result.modules.forEach((m) => {
    lines.push(`<tr><td>${escapeHtml(m.name)}</td><td>${m.hours} hr</td></tr>`);
  });
  lines.push("</tbody></table>");

  lines.push("<h2>建議講師人選</h2>");
  lines.push("<table>");
  lines.push("<thead><tr><th>講師姓名</th><th>教學領域</th><th style=\"width:100px\">來源</th></tr></thead>");
  lines.push("<tbody>");
  result.instructors.forEach((inst) => {
    const badgeClass = inst.source === "web_search" ? "badge-web" : "badge-ai";
    const label = inst.source === "web_search" ? "網路搜尋" : "AI 推薦";
    lines.push(`<tr><td><strong>${escapeHtml(inst.name)}</strong></td><td>${escapeHtml(inst.expertise)}</td><td><span class="badge ${badgeClass}">${label}</span></td></tr>`);
  });
  lines.push("</tbody></table>");

  if (result.instructors.some((i) => i.source === "ai_recommendation")) {
    lines.push('<p class="muted">※ AI 推薦的講師人選僅供參考，建議人工查證實際資歷</p>');
  }

  if (data.input?.requirementText) {
    lines.push("<h2>原始培訓需求</h2>");
    lines.push(`<pre style="background:#f9fafb;padding:1rem;border-radius:0.5rem;overflow-x:auto;font-size:0.875rem">${escapeHtml(data.input.requirementText.slice(0, 3000))}</pre>`);
  }

  lines.push("<footer><p>此草案由培訓師瑞士刀課程規劃幫手產生，供討論參考使用；非學院正式核可文件。</p></footer>");
  lines.push("</body></html>");

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { format, data } = body as { format?: string; data?: ExportData };

    if (!data) {
      return NextResponse.json({ error: "缺少匯出資料" }, { status: 400 });
    }

    const title = data.result?.suggestedTitle?.slice(0, 30) || "課程規劃";
    const safeTitle = title.replace(/[<>:"/\\|?*]/g, "_");

    if (format === "markdown") {
      const md = generateMarkdown(data);
      return new NextResponse(md, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(safeTitle)}.md"`,
        },
      });
    }

    if (format === "json") {
      return new NextResponse(JSON.stringify(data, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(safeTitle)}.json"`,
        },
      });
    }

    if (format === "html") {
      const html = generateHtml(data);
      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(safeTitle)}.html"`,
        },
      });
    }

    return NextResponse.json({ error: "不支援的匯出格式，請選擇 markdown、html 或 json" }, { status: 400 });
  } catch (e) {
    console.error("[POST /api/planning/export]", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
