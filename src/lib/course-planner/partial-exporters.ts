/**
 * 課程規劃工具箱 — 部分結果匯出
 *
 * 與 `exporters.ts` 不同，這支處理「使用者只跑某幾個 Skill」的散裝結果，
 * 直接把每個 Skill 的 output 用人類可讀的方式渲染成 Markdown / HTML，
 * 不嘗試合成完整開班計畫表（畢竟很可能根本沒跑完該合成的 7 個 form skill）。
 *
 * 注意：本檔故意不加 "server-only"，可在 client 直接呼叫，
 * 讓工具箱頁面拿到 SSE 結果之後不必再打 API 即可下載／截圖。
 */

import type { LlmSkillName } from "./schemas/common";
import type { NeedsOutput } from "./schemas/needs";
import type { AudienceOutput } from "./schemas/audience";
import type { ObjectivesOutput } from "./schemas/objectives";
import type { OutlineOutput, OutlineSession } from "./schemas/outline";
import type { FormatOutput } from "./schemas/format";
import type { InstructorOutput, Candidate } from "./schemas/instructor";
import type { ScheduleOutput } from "./schemas/schedule";
import type { PromoOutput } from "./schemas/promo";
import type { NotificationOutput } from "./schemas/notification";
import type { MaterialsOutput, MaterialItem } from "./schemas/materials";
import type { AssessmentOutput, InClassTask } from "./schemas/assessment";

// ============================================================
// 共用類型 + 工具
// ============================================================

export interface PartialSkillResult {
  skill: LlmSkillName;
  displayName: string;
  isAuxiliary: boolean;
  output: unknown;
  reasoning?: string;
  durationMs?: number;
  cached?: boolean;
}

export interface PartialExportSource {
  /** 工具箱規劃單 ID（顯示在頁尾） */
  requestId?: string | null;
  /** 來源原始需求文字（mode A 或 mode B 沿用） */
  rawInputText?: string | null;
  /** 已成功的 Skill 結果，按 pipeline 順序排好 */
  results: PartialSkillResult[];
  /** 產生時間（預設為現在） */
  generatedAt?: Date;
}

const SESSION_TYPE_LABEL: Record<OutlineSession["type"], string> = {
  lecture: "講授",
  exercise: "實作演練",
  discussion: "討論",
  case_study: "案例研討",
  project: "專案",
};

const PRIMARY_FORMAT_LABEL: Record<FormatOutput["primaryFormat"], string> = {
  in_person: "實體",
  online_live: "線上直播",
  online_async: "線上非同步",
  hybrid: "混成（實體 + 線上）",
  workshop: "工作坊",
  self_paced: "自學",
};

const SOURCE_LABEL: Record<Candidate["source"], string> = {
  personal: "個人師資人脈",
  trainer: "培訓師名冊",
  history: "歷史授課紀錄",
  web: "網路搜尋（建議人工查證）",
  ai_recommendation: "AI 推薦",
};

function isoToZh(d: Date): string {
  try {
    return d.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  } catch {
    return d.toISOString();
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

/** Markdown bullet list；空陣列回空字串 */
function mdList(items: string[]): string {
  return items.length === 0 ? "" : items.map((s) => `- ${s}`).join("\n");
}

function htmlList(items: string[]): string {
  return items.length === 0 ? "" : `<ul>${items.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`;
}

// ============================================================
// 各 Skill Markdown 渲染
// ============================================================

function renderNeedsMd(o: NeedsOutput): string {
  const lines: string[] = [];
  lines.push(`**需求摘要**：${o.needsSummary}`);
  lines.push("");
  if (o.reportedPainPoints.length > 0) {
    lines.push(`**需求方提到的痛點**`);
    lines.push(mdList(o.reportedPainPoints));
    lines.push("");
  }
  lines.push(`**真正的能力差距**`);
  for (const g of o.capabilityGaps) {
    lines.push(`- **${g.gap}**`);
    lines.push(`  - 哪一群人欠缺：${g.whoLacks}`);
    lines.push(`  - 從原始需求中看到的線索：${g.evidenceFromInput}`);
  }
  lines.push("");
  lines.push(`**這是培訓能解決的問題嗎？** ${o.isTrainingProblem ? "是" : "否"}`);
  if (!o.isTrainingProblem && o.nonTrainingAdvice) {
    lines.push("");
    lines.push(`**建議非培訓行動**：${o.nonTrainingAdvice}`);
  }
  lines.push("");
  lines.push(`**建議課程主題方向**`);
  lines.push(mdList(o.topicDirections));
  lines.push("");
  lines.push(`**案由說明（可直接抄到開班計畫表）**`);
  lines.push("");
  lines.push(`> ${o.caseRationale.replace(/\n/g, "\n> ")}`);
  if (o.missingInfo.length > 0) {
    lines.push("");
    lines.push(`**還需要補的資訊**`);
    lines.push(mdList(o.missingInfo));
  }
  return lines.join("\n");
}

function renderAudienceMd(o: AudienceOutput): string {
  const lines: string[] = [];
  lines.push(`**主要對象**：${o.primaryAudience}`);
  lines.push("");
  lines.push(`**預備知識**：${o.prerequisites}`);
  lines.push("");
  if (o.notSuitableFor.length > 0) {
    lines.push(`**不適合的對象**`);
    lines.push(mdList(o.notSuitableFor));
    lines.push("");
  }
  lines.push(`**細分輪廓**`);
  lines.push("");
  for (const seg of o.segments) {
    lines.push(`### ${seg.role}（${seg.seniority}）`);
    lines.push(`- 先備知識：${seg.priorKnowledge}`);
    lines.push(`- 工作場景：${seg.workScenario}`);
    if (seg.learningPainPoints.length > 0) {
      lines.push(`- 學習痛點：${seg.learningPainPoints.join("、")}`);
    }
    if (seg.expectations.length > 0) {
      lines.push(`- 對課程的期待：${seg.expectations.join("、")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function renderObjectivesMd(o: ObjectivesOutput): string {
  const lines: string[] = [];
  lines.push(`**課程終點**：${o.endpoint}`);
  lines.push("");
  lines.push(`**學習目標**`);
  for (const obj of o.objectives) {
    lines.push(`${obj.id}. ${obj.statement}`);
    lines.push(`   - 驗證方式：${obj.evidence}`);
    if (obj.observableBehavior) {
      lines.push(`   - 工作中可觀察到的行為：${obj.observableBehavior}`);
    }
  }
  return lines.join("\n");
}

function renderOutlineMd(o: OutlineOutput): string {
  const lines: string[] = [];
  lines.push(`**最終建議班名**：${o.finalTopic}`);
  lines.push("");
  lines.push(`**總時數**：${o.totalHours} 小時，共 ${o.sessions.length} 堂`);
  lines.push("");
  lines.push(`**學習路徑**`);
  lines.push("");
  lines.push(`> ${o.learningPath.replace(/\n/g, "\n> ")}`);
  lines.push("");
  if (o.courseFeatures.length > 0) {
    lines.push(`**本課程特色**`);
    lines.push(mdList(o.courseFeatures));
    lines.push("");
  }
  lines.push(`**堂課明細**`);
  lines.push("");
  for (const s of o.sessions) {
    lines.push(`### 第 ${s.position} 堂｜${s.name}`);
    lines.push(`- **時數**：${s.hours} 小時｜**性質**：${SESSION_TYPE_LABEL[s.type]}`);
    if (s.linkedObjectiveIds.length > 0) {
      lines.push(`- **對應學習目標**：${s.linkedObjectiveIds.join("、")}`);
    }
    lines.push("");
    lines.push(`**內容說明**`);
    lines.push("");
    lines.push(s.description);
    if (s.keyPoints.length > 0) {
      lines.push("");
      lines.push(`**重點**`);
      lines.push(mdList(s.keyPoints));
    }
    if (s.inClassActivity) {
      lines.push("");
      lines.push(`**課中活動**：${s.inClassActivity}`);
    }
    if (s.studentTakeaway) {
      lines.push("");
      lines.push(`**學員帶走**：${s.studentTakeaway}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function renderFormatMd(o: FormatOutput): string {
  const lines: string[] = [];
  lines.push(`**主要授課形式**：${PRIMARY_FORMAT_LABEL[o.primaryFormat]}`);
  lines.push("");
  lines.push(`**形式選擇理由**`);
  lines.push("");
  lines.push(`> ${o.formatRationale.replace(/\n/g, "\n> ")}`);
  if (o.teachingMethods.length > 0) {
    lines.push("");
    lines.push(`**教學方法**`);
    lines.push(mdList(o.teachingMethods));
  }
  if (o.toolsAndPlatforms.length > 0) {
    lines.push("");
    lines.push(`**工具與平台**`);
    lines.push(mdList(o.toolsAndPlatforms));
  }
  return lines.join("\n");
}

function renderCandidateMd(c: Candidate): string {
  const meta: string[] = [`來源：${SOURCE_LABEL[c.source]}`];
  if (c.organization) meta.push(`單位：${c.organization}`);
  if (c.email) meta.push(`Email：${c.email}`);
  if (c.phone) meta.push(`電話：${c.phone}`);
  const lines: string[] = [];
  lines.push(`- **${c.name}**（${meta.join("｜")}）`);
  lines.push(`  - 擅長領域：${c.expertise}`);
  lines.push(`  - 適配理由：${c.fitReasoning}`);
  if (c.notes) lines.push(`  - 注意事項：${c.notes}`);
  return lines.join("\n");
}

function renderInstructorMd(o: InstructorOutput): string {
  const lines: string[] = [];
  lines.push(`**整體策略**：${o.overallStrategy}`);
  lines.push("");
  lines.push(`**網路搜尋執行狀態**：${o.webSearchPerformed ? "已搜尋（外部來源請人工查證）" : "未搜尋（受 AI 供應商限制）"}`);
  lines.push("");
  lines.push(`**各堂課講師建議**`);
  lines.push("");
  for (const m of o.matches) {
    lines.push(`### 第 ${m.sessionPosition} 堂｜${m.sessionName}`);
    lines.push("");
    lines.push(`**主推**`);
    lines.push(renderCandidateMd(m.primary));
    if (m.alternatives.length > 0) {
      lines.push("");
      lines.push(`**備選**`);
      for (const c of m.alternatives) lines.push(renderCandidateMd(c));
    }
    lines.push("");
  }
  return lines.join("\n");
}

function renderScheduleMd(o: ScheduleOutput): string {
  const lines: string[] = [];
  lines.push(`**建議天數**：${o.recommendedDays} 天，每日 ${o.hoursPerDay} 小時，總計 ${o.totalHours} 小時`);
  lines.push(`**是否分段（跨週／跨月）**：${o.splitAcrossWeeks ? "是" : "否"}`);
  lines.push(`**報到時間**：${o.suggestedCheckInTime}　**結訓時間**：${o.suggestedGraduationTime}`);
  lines.push("");
  lines.push(`**節奏建議**`);
  lines.push("");
  lines.push(`> ${o.cadenceNote.replace(/\n/g, "\n> ")}`);
  if (o.preCourseTasks.length > 0) {
    lines.push("");
    lines.push(`**課前準備**`);
    lines.push(mdList(o.preCourseTasks));
  }
  if (o.postCourseCheckpoints.length > 0) {
    lines.push("");
    lines.push(`**課後追蹤節點**`);
    lines.push(mdList(o.postCourseCheckpoints));
  }
  if (o.periodsToAvoid.length > 0) {
    lines.push("");
    lines.push(`**應避開的時段**`);
    lines.push(mdList(o.periodsToAvoid));
  }
  return lines.join("\n");
}

function renderPromoMd(o: PromoOutput): string {
  const lines: string[] = [];
  lines.push(`**文案標題**：${o.title}`);
  lines.push("");
  lines.push(`**一句話 elevator pitch**：${o.shortIntro}`);
  lines.push("");
  lines.push(`**完整課程介紹**`);
  lines.push("");
  lines.push(o.fullDescription);
  lines.push("");
  lines.push(`**學員效益**`);
  lines.push(mdList(o.benefitBullets));
  lines.push("");
  lines.push(`**Call to Action**：${o.callToAction}`);
  return lines.join("\n");
}

function renderNotificationMd(o: NotificationOutput): string {
  const lines: string[] = [];
  lines.push(`**主旨**：${o.subject}`);
  lines.push("");
  lines.push(`**內文**`);
  lines.push("");
  lines.push(o.body);
  if (o.checklistBeforeClass.length > 0) {
    lines.push("");
    lines.push(`**學員課前檢查清單**`);
    lines.push(mdList(o.checklistBeforeClass));
  }
  return lines.join("\n");
}

function renderMaterialItemList(items: MaterialItem[], heading: string): string {
  if (items.length === 0) return "";
  const lines: string[] = [];
  lines.push(`**${heading}**`);
  for (const it of items) lines.push(`- **${it.name}** — ${it.purpose}`);
  return lines.join("\n");
}

function renderMaterialsMd(o: MaterialsOutput): string {
  const blocks: string[] = [];
  const slides = renderMaterialItemList(o.slides, "投影片");
  if (slides) blocks.push(slides);
  const handouts = renderMaterialItemList(o.handouts, "講義");
  if (handouts) blocks.push(handouts);
  const examples = renderMaterialItemList(o.examples, "範例檔");
  if (examples) blocks.push(examples);
  const exercises = renderMaterialItemList(o.exercises, "練習題");
  if (exercises) blocks.push(exercises);
  if (o.preClassFeatures.length > 0) {
    blocks.push(`**課前特色**\n${mdList(o.preClassFeatures)}`);
  }
  if (o.inClassFeatures.length > 0) {
    blocks.push(`**課中特色**\n${mdList(o.inClassFeatures)}`);
  }
  if (o.postClassFeatures.length > 0) {
    blocks.push(`**課後特色**\n${mdList(o.postClassFeatures)}`);
  }
  return blocks.join("\n\n");
}

function renderInClassTaskMd(t: InClassTask): string {
  return `- **${t.name}**\n  - 任務說明：${t.description}\n  - 學會證據：${t.evidenceOfLearning}`;
}

function renderAssessmentMd(o: AssessmentOutput): string {
  const lines: string[] = [];
  if (o.preAssessment) {
    lines.push(`**課前評估**`);
    lines.push("");
    lines.push(o.preAssessment);
    lines.push("");
  }
  lines.push(`**課中實作任務**`);
  for (const t of o.inClassTasks) lines.push(renderInClassTaskMd(t));
  if (o.postAssessment) {
    lines.push("");
    lines.push(`**課後評估**`);
    lines.push("");
    lines.push(o.postAssessment);
  }
  if (o.finalProject) {
    lines.push("");
    lines.push(`**結業專案**`);
    lines.push("");
    lines.push(o.finalProject);
  }
  if (o.managerObservationForm) {
    lines.push("");
    lines.push(`**主管觀察表**`);
    lines.push("");
    lines.push(o.managerObservationForm);
  }
  return lines.join("\n");
}

const SKILL_RENDERERS_MD: Record<LlmSkillName, (out: unknown) => string> = {
  needs: (o) => renderNeedsMd(o as NeedsOutput),
  audience: (o) => renderAudienceMd(o as AudienceOutput),
  objectives: (o) => renderObjectivesMd(o as ObjectivesOutput),
  outline: (o) => renderOutlineMd(o as OutlineOutput),
  format: (o) => renderFormatMd(o as FormatOutput),
  instructor: (o) => renderInstructorMd(o as InstructorOutput),
  schedule: (o) => renderScheduleMd(o as ScheduleOutput),
  promo: (o) => renderPromoMd(o as PromoOutput),
  notification: (o) => renderNotificationMd(o as NotificationOutput),
  materials: (o) => renderMaterialsMd(o as MaterialsOutput),
  assessment: (o) => renderAssessmentMd(o as AssessmentOutput),
};

// ============================================================
// 整份 Markdown 組合
// ============================================================
export function buildPartialMarkdown(src: PartialExportSource): string {
  const generatedAt = src.generatedAt ?? new Date();
  const lines: string[] = [];
  const skillNames = src.results.map((r) => r.displayName).join(" + ");
  lines.push(`# 課程規劃工具箱結果：${skillNames}`);
  lines.push("");
  lines.push(
    `> 由「培訓師瑞士刀 · 課程規劃工具箱」於 ${isoToZh(generatedAt)} 自動產生。**非**中華電信學院正式核可文件。`,
  );
  if (src.requestId) {
    lines.push(`> Request ID：\`${src.requestId}\``);
  }
  lines.push("");

  if (src.rawInputText) {
    lines.push("## 原始需求摘要");
    lines.push("");
    const trimmed = src.rawInputText.length > 1500 ? src.rawInputText.slice(0, 1500) + "…" : src.rawInputText;
    for (const ln of trimmed.split("\n")) {
      lines.push(`> ${ln}`);
    }
    lines.push("");
  }

  for (const r of src.results) {
    const auxBadge = r.isAuxiliary ? "（自動補跑上游）" : "";
    lines.push(`## ${r.displayName}${auxBadge}`);
    lines.push("");
    if (r.reasoning) {
      lines.push(`**判斷依據**：${r.reasoning}`);
      lines.push("");
    }
    const renderer = SKILL_RENDERERS_MD[r.skill];
    try {
      lines.push(renderer ? renderer(r.output) : "（此 Skill 尚未支援結構化匯出，請使用 JSON 下載）");
    } catch (e) {
      lines.push(`> （渲染失敗：${(e as Error).message}）`);
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(r.output, null, 2));
      lines.push("```");
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n").replace(/---\s*$/, "").trim() + "\n";
}

// ============================================================
// HTML（給瀏覽器預覽 + PNG 截圖用）
// ============================================================

/** Markdown → HTML（極簡 markdown：標題、清單、引用、強調、水平線、換行） */
function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inUl = false;
  let inBlockquote = false;

  const closeBlocks = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inBlockquote) {
      out.push("</blockquote>");
      inBlockquote = false;
    }
  };

  const inline = (s: string): string => {
    let r = escapeHtml(s);
    // **bold**
    r = r.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // `code`
    r = r.replace(/`([^`]+)`/g, "<code>$1</code>");
    return r;
  };

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (/^---\s*$/.test(line)) {
      closeBlocks();
      out.push('<hr class="divider"/>');
      continue;
    }
    const h1 = /^#\s+(.*)$/.exec(line);
    if (h1) {
      closeBlocks();
      out.push(`<h1>${inline(h1[1])}</h1>`);
      continue;
    }
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) {
      closeBlocks();
      out.push(`<h2>${inline(h2[1])}</h2>`);
      continue;
    }
    const h3 = /^###\s+(.*)$/.exec(line);
    if (h3) {
      closeBlocks();
      out.push(`<h3>${inline(h3[1])}</h3>`);
      continue;
    }
    const bullet = /^-\s+(.*)$/.exec(line);
    if (bullet) {
      if (inBlockquote) {
        out.push("</blockquote>");
        inBlockquote = false;
      }
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    const sub = /^\s{2,}-\s+(.*)$/.exec(raw);
    if (sub) {
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li class="sub">${inline(sub[1])}</li>`);
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inBlockquote) {
        out.push("<blockquote>");
        inBlockquote = true;
      }
      out.push(`<p>${inline(quote[1])}</p>`);
      continue;
    }
    if (line.trim() === "") {
      closeBlocks();
      continue;
    }
    closeBlocks();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeBlocks();
  return out.join("\n");
}

const HTML_STYLES = `
  body { font-family: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif; line-height: 1.7; color: #1f2937; max-width: 880px; margin: 24px auto; padding: 32px 40px; background: #ffffff; }
  h1 { font-size: 26px; font-weight: 700; border-bottom: 3px solid #8b5cf6; padding-bottom: 8px; margin: 0 0 18px; color: #4c1d95; }
  h2 { font-size: 20px; font-weight: 700; color: #5b21b6; margin: 28px 0 12px; padding-left: 10px; border-left: 4px solid #8b5cf6; }
  h3 { font-size: 16px; font-weight: 700; margin: 18px 0 8px; color: #374151; }
  p { margin: 8px 0; }
  ul { margin: 6px 0 14px; padding-left: 24px; }
  li { margin: 4px 0; }
  li.sub { list-style-type: circle; margin-left: 12px; color: #4b5563; font-size: 0.95em; }
  blockquote { margin: 12px 0; padding: 10px 14px; background: #f5f3ff; border-left: 4px solid #c4b5fd; border-radius: 4px; color: #4b5563; }
  blockquote p { margin: 4px 0; }
  strong { color: #111827; font-weight: 700; }
  code { background: #f3f4f6; padding: 1px 6px; border-radius: 3px; font-family: "JetBrains Mono", monospace; font-size: 0.9em; }
  hr.divider { border: none; border-top: 1px dashed #d1d5db; margin: 24px 0; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center; }
`;

export function buildPartialHtml(src: PartialExportSource): string {
  const md = buildPartialMarkdown(src);
  const inner = mdToHtml(md);
  const generatedAt = src.generatedAt ?? new Date();
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<title>課程規劃工具箱結果</title>
<style>${HTML_STYLES}</style>
</head>
<body>
${inner}
<div class="footer">由「培訓師瑞士刀 · 課程規劃工具箱」於 ${isoToZh(generatedAt)} 自動產生</div>
</body>
</html>`;
}
