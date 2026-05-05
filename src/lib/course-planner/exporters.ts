/**
 * 課程規劃幫手 — 匯出工具
 *
 * 把 CoursePlanForm + AuxiliaryDocs 轉成各格式：markdown / html / json / docx (HTML-with-Word-MIME)。
 */
import "server-only";

import type { CoursePlanForm, AuxiliaryDocs, SessionItem } from "./schemas/form";

export interface ExportSource {
  title: string | null;
  rawInputText?: string | null;
  form: CoursePlanForm;
  auxDocs: AuxiliaryDocs;
}

const SESSION_TYPE_LABEL: Record<SessionItem["type"], string> = {
  lecture: "講授",
  exercise: "實作演練",
  discussion: "討論",
  case_study: "案例研討",
  project: "專案",
};

function isoToZh(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  } catch {
    return iso;
  }
}

function escapeHtml(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================================
// Markdown
// ============================================================
export function toMarkdown(src: ExportSource): string {
  const f = src.form.aiFilled;
  const m = src.form.manual;
  const aux = src.auxDocs;
  const lines: string[] = [];

  lines.push(`# ${f.topic || src.title || "（未命名開班計畫）"}`);
  lines.push("");
  lines.push(`> 本檔由「培訓師瑞士刀 · 課程規劃幫手」於 ${isoToZh(new Date().toISOString())} 自動產生。**非**中華電信學院正式核可文件。`);
  lines.push("");

  const totalHours = f.sessions.reduce((sum, s) => sum + s.hours, 0);

  lines.push("## 一、班次基本資訊");
  lines.push("");
  lines.push("| 項目 | 內容 |");
  lines.push("| --- | --- |");
  lines.push(`| 主題（班名） | ${f.topic || "—"} |`);
  lines.push(`| 班代號（9 碼） | ${m.classCode || "（培訓師手填）"} |`);
  lines.push(`| 對象 | ${f.audience} |`);
  if (f.notSuitableFor.length > 0) {
    lines.push(`| 不適合報名 | ${f.notSuitableFor.join("；")} |`);
  }
  lines.push(`| 預備知識 | ${f.prerequisites} |`);
  lines.push(`| 總時數 | ${totalHours} 小時（${f.sessions.length} 堂） |`);
  lines.push("");

  lines.push("## 二、學習目標");
  lines.push("");
  f.objectives.forEach((o, i) => lines.push(`${i + 1}. ${o}`));
  lines.push("");

  lines.push("## 三、本課程特色");
  lines.push("");
  f.courseFeatures.forEach((c) => lines.push(`- ${c}`));
  lines.push("");

  lines.push("## 四、課程資料（堂課明細）");
  lines.push("");
  f.sessions.forEach((s) => {
    lines.push(
      `### 第 ${s.position} 堂　${s.name}　（${s.hours} 小時 · ${SESSION_TYPE_LABEL[s.type]}）`,
    );
    if (s.primaryInstructorName) {
      lines.push(`**主講人**：${s.primaryInstructorName}`);
    }
    lines.push("");
    lines.push("**內容描述**：");
    lines.push(s.description);
    lines.push("");
    if ((s.keyPoints?.length ?? 0) > 0) {
      lines.push("**重點**：");
      s.keyPoints!.forEach((k) => lines.push(`- ${k}`));
      lines.push("");
    }
    if (s.inClassActivity) {
      lines.push(`**課中活動**：${s.inClassActivity}`);
      lines.push("");
    }
    if (s.studentTakeaway) {
      lines.push(`**學員帶走**：${s.studentTakeaway}`);
      lines.push("");
    }
  });
  lines.push("");

  lines.push("## 五、案由說明");
  lines.push("");
  lines.push(f.caseRationale);
  lines.push("");

  // ===== 輔助文件 =====
  if (aux.promo) {
    lines.push("## 六、課程文案（輔助文件）");
    lines.push("");
    lines.push(`**標題**：${aux.promo.title}`);
    lines.push("");
    lines.push(`**簡介**：${aux.promo.shortIntro}`);
    lines.push("");
    lines.push(aux.promo.fullDescription);
    lines.push("");
    lines.push("**學員效益**：");
    aux.promo.benefitBullets.forEach((b) => lines.push(`- ${b}`));
    lines.push("");
    lines.push(`**CTA**：${aux.promo.callToAction}`);
    lines.push("");
  }

  if (aux.notification) {
    lines.push("## 七、課前通知（輔助文件）");
    lines.push("");
    lines.push(`**主旨**：${aux.notification.subject}`);
    lines.push("");
    lines.push("```");
    lines.push(aux.notification.body);
    lines.push("```");
    lines.push("");
    lines.push("**課前準備清單**：");
    aux.notification.checklistBeforeClass.forEach((c) => lines.push(`- ${c}`));
    lines.push("");
  }

  if (aux.materials) {
    lines.push("## 八、教材資源（輔助文件）");
    lines.push("");
    if (aux.materials.slides.length) {
      lines.push("### 投影片");
      aux.materials.slides.forEach((it) => lines.push(`- ${it.name}：${it.purpose}`));
      lines.push("");
    }
    if (aux.materials.handouts.length) {
      lines.push("### 講義");
      aux.materials.handouts.forEach((it) => lines.push(`- ${it.name}：${it.purpose}`));
      lines.push("");
    }
    if (aux.materials.examples.length) {
      lines.push("### 範例檔");
      aux.materials.examples.forEach((it) => lines.push(`- ${it.name}：${it.purpose}`));
      lines.push("");
    }
    if (aux.materials.exercises.length) {
      lines.push("### 練習資料");
      aux.materials.exercises.forEach((it) => lines.push(`- ${it.name}：${it.purpose}`));
      lines.push("");
    }
  }

  if (aux.assessment) {
    lines.push("## 九、課程評量（輔助文件）");
    lines.push("");
    if (aux.assessment.preAssessment) {
      lines.push(`**課前評估**：${aux.assessment.preAssessment}`);
      lines.push("");
    }
    lines.push("**課中實作任務**：");
    aux.assessment.inClassTasks.forEach((t, i) =>
      lines.push(`${i + 1}. **${t.name}** — ${t.description}（證明學會：${t.evidenceOfLearning}）`),
    );
    lines.push("");
    if (aux.assessment.postAssessment) {
      lines.push(`**課後評估**：${aux.assessment.postAssessment}`);
      lines.push("");
    }
    if (aux.assessment.finalProject) {
      lines.push(`**結業專案**：${aux.assessment.finalProject}`);
      lines.push("");
    }
    if (aux.assessment.managerObservationForm) {
      lines.push(`**主管觀察表**：${aux.assessment.managerObservationForm}`);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");
  lines.push("*此草案由培訓師瑞士刀課程規劃幫手產生，供討論參考使用；非學院正式核可文件。*");

  return lines.join("\n");
}

// ============================================================
// HTML
// ============================================================
export function toHtml(src: ExportSource): string {
  const f = src.form.aiFilled;
  const m = src.form.manual;
  const aux = src.auxDocs;
  const title = escapeHtml(f.topic || src.title || "（未命名開班計畫）");

  const sessionBlocks = f.sessions
    .map(
      (s) => `<section style="margin:18px 0;padding:12px 14px;border:1px solid #e2e8f0;border-radius:8px;">
        <h3 style="margin:0 0 8px;font-size:1.05rem;color:#334155;">
          第 ${s.position} 堂　${escapeHtml(s.name)}
          <span style="font-size:0.85rem;color:#64748b;font-weight:normal;">（${s.hours} 小時 · ${SESSION_TYPE_LABEL[s.type]}）</span>
        </h3>
        ${s.primaryInstructorName ? `<p style="margin:4px 0;color:#475569;"><strong>主講人</strong>：${escapeHtml(s.primaryInstructorName)}</p>` : ""}
        <p style="margin:8px 0;line-height:1.7;"><strong>內容描述</strong>：${escapeHtml(s.description).replace(/\n/g, "<br/>")}</p>
        ${
          (s.keyPoints?.length ?? 0) > 0
            ? `<div style="margin:8px 0;"><strong>重點</strong>：<ul style="margin:4px 0 4px 20px;">${s.keyPoints!.map((k) => `<li>${escapeHtml(k)}</li>`).join("")}</ul></div>`
            : ""
        }
        ${s.inClassActivity ? `<p style="margin:6px 0;"><strong>課中活動</strong>：${escapeHtml(s.inClassActivity)}</p>` : ""}
        ${s.studentTakeaway ? `<p style="margin:6px 0;"><strong>學員帶走</strong>：${escapeHtml(s.studentTakeaway)}</p>` : ""}
      </section>`,
    )
    .join("\n");

  const totalHours = f.sessions.reduce((sum, s) => sum + s.hours, 0);

  const auxBlocks: string[] = [];
  if (aux.promo) {
    auxBlocks.push(`<h2>六、課程文案</h2>
      <p><strong>標題</strong>：${escapeHtml(aux.promo.title)}</p>
      <p><strong>簡介</strong>：${escapeHtml(aux.promo.shortIntro)}</p>
      <p>${escapeHtml(aux.promo.fullDescription).replace(/\n/g, "<br/>")}</p>
      <ul>${aux.promo.benefitBullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
      <p><strong>CTA</strong>：${escapeHtml(aux.promo.callToAction)}</p>`);
  }
  if (aux.notification) {
    auxBlocks.push(`<h2>七、課前通知</h2>
      <p><strong>主旨</strong>：${escapeHtml(aux.notification.subject)}</p>
      <pre style="white-space:pre-wrap;background:#f8fafc;padding:12px;border-radius:6px;">${escapeHtml(aux.notification.body)}</pre>
      <ul>${aux.notification.checklistBeforeClass.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>`);
  }
  if (aux.materials) {
    const list = (label: string, items: Array<{ name: string; purpose: string }>) =>
      items.length === 0
        ? ""
        : `<h3>${label}</h3><ul>${items.map((it) => `<li><strong>${escapeHtml(it.name)}</strong>：${escapeHtml(it.purpose)}</li>`).join("")}</ul>`;
    auxBlocks.push(`<h2>八、教材資源</h2>
      ${list("投影片", aux.materials.slides)}
      ${list("講義", aux.materials.handouts)}
      ${list("範例檔", aux.materials.examples)}
      ${list("練習資料", aux.materials.exercises)}`);
  }
  if (aux.assessment) {
    auxBlocks.push(`<h2>九、課程評量</h2>
      ${aux.assessment.preAssessment ? `<p><strong>課前評估</strong>：${escapeHtml(aux.assessment.preAssessment)}</p>` : ""}
      <ol>${aux.assessment.inClassTasks
        .map(
          (t) =>
            `<li><strong>${escapeHtml(t.name)}</strong>：${escapeHtml(t.description)}<br/><em>證明學會</em>：${escapeHtml(t.evidenceOfLearning)}</li>`,
        )
        .join("")}</ol>
      ${aux.assessment.postAssessment ? `<p><strong>課後評估</strong>：${escapeHtml(aux.assessment.postAssessment)}</p>` : ""}
      ${aux.assessment.finalProject ? `<p><strong>結業專案</strong>：${escapeHtml(aux.assessment.finalProject)}</p>` : ""}
      ${aux.assessment.managerObservationForm ? `<p><strong>主管觀察表</strong>：${escapeHtml(aux.assessment.managerObservationForm)}</p>` : ""}`);
  }

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  body { font-family: 'Microsoft JhengHei', system-ui, sans-serif; line-height:1.7; max-width:980px; margin:24px auto; padding:0 16px; color:#1e293b; }
  h1 { font-size:1.6rem; border-bottom:2px solid #6366f1; padding-bottom:8px; }
  h2 { font-size:1.2rem; margin-top:24px; color:#334155; }
  h3 { font-size:1rem; margin-top:16px; color:#475569; }
  table { border-collapse:collapse; width:100%; margin:12px 0; font-size:0.95rem; }
  th, td { border:1px solid #cbd5e1; padding:8px 10px; vertical-align:top; }
  th { background:#f1f5f9; font-weight:600; text-align:left; }
  .meta { color:#64748b; font-size:0.85rem; margin-bottom:12px; }
  .red { color:#b91c1c; }
  ul { padding-left:20px; }
</style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">本檔由「培訓師瑞士刀 · 課程規劃幫手」於 ${escapeHtml(isoToZh(new Date().toISOString()))} 自動產生。<strong>非</strong>中華電信學院正式核可文件。</div>

  <h2>一、班次基本資訊</h2>
  <table>
    <tr><th>主題（班名）</th><td colspan="3">${escapeHtml(f.topic)}</td></tr>
    <tr><th>班代號（9 碼）</th><td colspan="3">${escapeHtml(m.classCode || "（培訓師手填）")}</td></tr>
    <tr><th>對象</th><td colspan="3">${escapeHtml(f.audience)}${f.notSuitableFor.length > 0 ? `<br/><span class="red">※ 不適合：${f.notSuitableFor.map((x) => escapeHtml(x)).join("；")}</span>` : ""}</td></tr>
    <tr><th>預備知識</th><td colspan="3">${escapeHtml(f.prerequisites)}</td></tr>
    <tr><th>總時數</th><td colspan="3">${totalHours} 小時（${f.sessions.length} 堂）</td></tr>
  </table>

  <h2>二、學習目標</h2>
  <ol>${f.objectives.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ol>

  <h2>三、本課程特色</h2>
  <ul>${f.courseFeatures.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>

  <h2>四、課程資料（堂課明細）</h2>
  ${sessionBlocks}

  <h2>五、案由說明</h2>
  <p>${escapeHtml(f.caseRationale).replace(/\n/g, "<br/>")}</p>

  ${auxBlocks.join("\n")}

  <hr/>
  <p style="color:#64748b;font-size:0.85rem;">此草案由培訓師瑞士刀課程規劃幫手產生，供討論參考使用；非學院正式核可文件。</p>
</body>
</html>`;
}

// ============================================================
// JSON
// ============================================================
export function toJson(src: ExportSource): string {
  return JSON.stringify(src, null, 2);
}
