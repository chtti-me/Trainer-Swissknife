/**
 * 【EDM：HTML 版型與配色】
 * 以電子郵件相容之表格排版，呈現海報級層次：主視覺、必備資訊格、課程內容、行銷文案與 CTA（Call to Action，行動呼籲）。
 */
import { EdmTemplate, EdmTemplateInput, ParsedClassInfo, ParsedFieldOption, ThemePalette } from "@/lib/edm/types";
import { pickStockImage } from "@/lib/edm/stock-images";

const defaultFont = `'Microsoft JhengHei', 'PingFang TC', 'Noto Sans TC', sans-serif`;

const PL = "（待補）";

export const EDM_PALETTES: ThemePalette[] = [
  { id: "academy", name: "學院藍金", primary: "#0A4D8C", secondary: "#F0F6FC", accent: "#C89B3C", background: "#FFFFFF", text: "#0F172A" },
  { id: "tech", name: "科技漸層", primary: "#312E81", secondary: "#EEF2FF", accent: "#7C3AED", background: "#FFFFFF", text: "#111827" },
  { id: "fresh", name: "清新綠白", primary: "#0F766E", secondary: "#ECFEFF", accent: "#059669", background: "#FFFFFF", text: "#134E4A" },
  { id: "warm", name: "暖橙培訓", primary: "#B45309", secondary: "#FFF7ED", accent: "#EA580C", background: "#FFFBF5", text: "#422006" },
  { id: "night", name: "夜幕專業", primary: "#0EA5E9", secondary: "#1E293B", accent: "#38BDF8", background: "#0F172A", text: "#E2E8F0" },
  { id: "simple", name: "簡約灰藍", primary: "#334155", secondary: "#F1F5F9", accent: "#2563EB", background: "#FFFFFF", text: "#0F172A" },
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function asParagraphs(text: string): string {
  return escapeHtml(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 14px;line-height:1.85;font-size:15px;">${line}</p>`)
    .join("");
}

function hasField(input: EdmTemplateInput, key: ParsedFieldOption["key"]): boolean {
  return input.selectedFieldKeys.includes(key);
}

function isDarkSurface(p: ThemePalette): boolean {
  return p.id === "night";
}

function formatRocDate(iso: string): string {
  const parts = iso.split("-").map((x) => parseInt(x, 10));
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return iso;
  const roc = y - 1911;
  return `${roc}年${m}月${d}日`;
}

function displayClassName(parsed: ParsedClassInfo): string {
  return parsed.className?.trim() || `${PL}班名`;
}

function primaryInstructor(parsed: ParsedClassInfo): string {
  const t = parsed.trainerName?.trim();
  if (t) return t;
  const fromItem = parsed.courseItems.map((c) => c.instructor?.trim()).find(Boolean);
  return fromItem || `${PL}講師`;
}

function displayDateRange(parsed: ParsedClassInfo): string {
  if (parsed.startDate && parsed.endDate) {
    return `${formatRocDate(parsed.startDate)}　至　${formatRocDate(parsed.endDate)}`;
  }
  if (parsed.startDate) return formatRocDate(parsed.startDate);
  return `${PL}開班日期`;
}

function displaySessionTime(parsed: ParsedClassInfo): string {
  const s = parsed.sessionTimeRange?.trim();
  if (s) return s.replace(/：/g, ":");
  const c = parsed.checkinTime?.trim();
  if (c) return `報到參考：${c.replace(/：/g, ":")}`;
  return `${PL}上課起迄時間`;
}

function renderOptionalSections(input: EdmTemplateInput): string {
  const { palette } = input;
  const muted = isDarkSurface(palette) ? "#94A3B8" : "#64748B";
  const sections: string[] = [];
  if (hasField(input, "goal") && input.parsed.goal) {
    sections.push(
      `<div style="margin:22px 0 0;padding:18px 20px;border-radius:12px;background:${palette.secondary};border-left:4px solid ${palette.accent};">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.12em;color:${palette.primary};">課程目標</div>
        <div style="margin-top:8px;color:${palette.text};">${asParagraphs(input.parsed.goal)}</div>
      </div>`
    );
  }
  if (hasField(input, "audience") && input.parsed.audience) {
    sections.push(
      `<div style="margin:16px 0 0;padding:18px 20px;border-radius:12px;border:1px solid ${isDarkSurface(palette) ? "#334155" : "#E2E8F0"};">
        <div style="font-size:12px;font-weight:700;color:${palette.primary};">適合對象</div>
        <div style="margin-top:8px;color:${palette.text};">${asParagraphs(input.parsed.audience)}</div>
      </div>`
    );
  }
  if (hasField(input, "prerequisites") && input.parsed.prerequisites) {
    sections.push(
      `<div style="margin:16px 0 0;padding:18px 20px;border-radius:12px;background:${palette.secondary};">
        <div style="font-size:12px;font-weight:700;color:${palette.primary};">預備知識</div>
        <div style="margin-top:8px;color:${palette.text};">${asParagraphs(input.parsed.prerequisites)}</div>
      </div>`
    );
  }
  if (hasField(input, "classId") && input.parsed.classId) {
    sections.push(
      `<p style="margin:18px 0 0;font-size:13px;color:${muted};">班代號：<strong style="color:${palette.text};">${escapeHtml(input.parsed.classId)}</strong></p>`
    );
  }
  if (hasField(input, "hours") && input.parsed.hours != null) {
    sections.push(
      `<p style="margin:8px 0 0;font-size:13px;color:${muted};">課程總時數：<strong style="color:${palette.text};">${escapeHtml(String(input.parsed.hours))}</strong> 小時</p>`
    );
  }
  if (hasField(input, "location") && input.parsed.location) {
    sections.push(
      `<p style="margin:8px 0 0;font-size:13px;color:${muted};">上課地點：<span style="color:${palette.text};">${escapeHtml(input.parsed.location)}</span></p>`
    );
  }
  if (hasField(input, "estimatedTraineeCount") && input.parsed.estimatedTraineeCount != null) {
    sections.push(
      `<p style="margin:8px 0 0;font-size:13px;color:${muted};">預調人數：<strong style="color:${palette.text};">${escapeHtml(String(input.parsed.estimatedTraineeCount))}</strong> 人</p>`
    );
  }
  return sections.join("");
}

function renderCta(input: EdmTemplateInput): string {
  if (!hasField(input, "registrationUrl") || !input.parsed.registrationUrl) return "";
  const { palette } = input;
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:32px auto 8px;">
    <tr>
      <td style="border-radius:999px;background:${palette.accent};box-shadow:0 10px 28px rgba(0,0,0,.12);">
        <a href="${input.parsed.registrationUrl}" style="display:inline-block;padding:16px 36px;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;letter-spacing:0.06em;">
          立即報名｜把握學習席次
        </a>
      </td>
    </tr>
  </table>`;
}

function heroAndStockImage(input: EdmTemplateInput): { src: string; alt: string; caption: string } {
  if (input.images.length > 0) {
    return {
      src: input.images[0].dataUrl,
      alt: escapeHtml(input.images[0].name),
      caption: "課程／活動影像（由主辦單位提供）",
    };
  }
  const stock = pickStockImage([
    input.parsed.className || "",
    input.parsed.goal || "",
    input.parsed.rawText || "",
    input.headline,
  ]);
  return {
    src: stock.url,
    alt: stock.alt,
    caption: "情境示意圖（依課程關鍵字自動配圖；圖片來源 Unsplash，可改上傳官方素材）",
  };
}

function renderExtraImages(input: EdmTemplateInput): string {
  if (input.images.length <= 1) return "";
  return input.images
    .slice(1)
    .map(
      (image) =>
        `<img src="${image.dataUrl}" alt="${escapeHtml(image.name)}" width="560" style="display:block;width:100%;max-width:560px;margin:14px auto 0;border-radius:10px;border:1px solid rgba(0,0,0,.08);" />`
    )
    .join("");
}

function renderMandatoryGrid(input: EdmTemplateInput): string {
  const { palette } = input;
  const border = isDarkSurface(palette) ? "#334155" : "#E2E8F0";
  const cellBg = isDarkSurface(palette) ? "#1E293B" : palette.secondary;
  const labelColor = palette.primary;
  const cell = (labelZh: string, labelEn: string, value: string) => `<td width="50%" style="vertical-align:top;padding:0 8px 16px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${border};border-radius:12px;overflow:hidden;">
      <tr><td style="padding:16px 18px;background:${cellBg};">
        <div style="font-size:11px;font-weight:800;letter-spacing:0.14em;color:${labelColor};">${labelZh}</div>
        <div style="font-size:10px;opacity:.65;margin-top:2px;color:${labelColor};">${labelEn}</div>
        <div style="font-size:16px;font-weight:700;color:${palette.text};margin-top:10px;line-height:1.5;">${escapeHtml(value)}</div>
      </td></tr>
    </table>
  </td>`;

  const c1 = displayClassName(input.parsed);
  const c2 = primaryInstructor(input.parsed);
  const c3 = displayDateRange(input.parsed);
  const c4 = displaySessionTime(input.parsed);

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
    <tr>${cell("班名", "CLASS", c1)}${cell("講師", "INSTRUCTOR", c2)}</tr>
    <tr>${cell("開班日期", "DATE", c3)}${cell("上課起迄時間", "SESSION TIME", c4)}</tr>
  </table>`;
}

function renderCourseContentBlock(input: EdmTemplateInput): string {
  const { parsed, palette } = input;
  const border = isDarkSurface(palette) ? "#334155" : "#E5E7EB";
  let inner: string;
  if (hasField(input, "courseItems") && parsed.courseItems.length > 0) {
    inner =
      `<ul style="margin:0;padding:0 0 0 22px;line-height:1.8;color:${palette.text};">` +
      parsed.courseItems
        .map(
          (item) =>
            `<li style="margin:10px 0;"><strong style="font-size:15px;">${escapeHtml(item.name)}</strong>` +
            `${item.code ? ` <span style="font-size:12px;opacity:.75;">（${escapeHtml(item.code)}）</span>` : ""}` +
            `${item.instructor ? `<div style="font-size:13px;opacity:.88;margin-top:4px;">講師：${escapeHtml(item.instructor)}</div>` : ""}</li>`
        )
        .join("") +
      `</ul>`;
  } else {
    inner = `<p style="margin:0;line-height:1.9;color:${palette.text};opacity:.92;font-size:15px;">
      此區為<strong>課程內容／大綱</strong>專用版面。若來源未含明細，請於產出後補上章節、時數分配或教材說明，亦可重新匯入含課程表的檔案後再生成。
    </p>`;
  }

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 0;border:1px solid ${border};border-radius:14px;overflow:hidden;">
    <tr><td style="padding:20px 22px 10px;background:${isDarkSurface(palette) ? "#1E293B" : palette.secondary};">
      <span style="font-size:12px;font-weight:800;letter-spacing:0.2em;color:${palette.accent};">CURRICULUM</span>
      <h2 style="margin:8px 0 0;font-size:21px;color:${palette.text};line-height:1.35;">課程內容</h2>
      <p style="margin:6px 0 0;font-size:13px;color:${isDarkSurface(palette) ? "#94A3B8" : "#64748B"};">清楚呈現學員將學到什麼，提升報名意願</p>
    </td></tr>
    <tr><td style="padding:18px 22px 22px;background:${palette.background};">${inner}</td></tr>
  </table>`;
}

function renderMarketingBlock(input: EdmTemplateInput): string {
  const { palette } = input;
  const border = isDarkSurface(palette) ? "#334155" : "#E2E8F0";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 0;border-radius:14px;border:1px solid ${border};overflow:hidden;">
    <tr><td style="padding:22px 24px 8px;background:${palette.secondary};">
      <div style="font-size:12px;font-weight:800;letter-spacing:0.18em;color:${palette.primary};">INVITATION</div>
      <h2 style="margin:10px 0 0;font-size:20px;color:${palette.text};">給學員的一段話</h2>
    </td></tr>
    <tr><td style="padding:8px 24px 24px;background:${palette.secondary};border-top:none;">
      <div style="border-left:4px solid ${palette.accent};padding:4px 0 4px 18px;">
        ${asParagraphs(input.bodyHtml)}
      </div>
    </td></tr>
  </table>`;
}

type LayoutVariant = "classic" | "tech" | "fresh" | "warm";

function variantBannerStyle(variant: LayoutVariant, p: ThemePalette): string {
  switch (variant) {
    case "tech":
      return `background:linear-gradient(125deg,${p.primary} 0%,${p.accent} 100%);padding:36px 32px 40px;color:#ffffff;`;
    case "fresh":
      return `background:${p.background};padding:32px 32px 8px;color:${p.text};border-bottom:4px solid ${p.accent};`;
    case "warm":
      return `background:linear-gradient(180deg,${p.primary} 0%,#9A3412 100%);padding:34px 32px 38px;color:#fffbeb;`;
    default:
      return `background:${p.primary};padding:34px 32px 38px;color:#ffffff;`;
  }
}

function renderMagazineLayout(input: EdmTemplateInput, variant: LayoutVariant): string {
  const { palette, headline, subheadline } = input;
  const banner = variantBannerStyle(variant, palette);
  const subColor =
    variant === "fresh" ? (isDarkSurface(palette) ? "#CBD5E1" : "#475569") : variant === "tech" || variant === "classic" ? "rgba(255,255,255,.92)" : "rgba(255,251,235,.95)";
  const titleColor = variant === "fresh" ? palette.text : variant === "warm" ? "#FFFBEB" : "#ffffff";

  const visual = heroAndStockImage(input);
  const capColor = isDarkSurface(palette) ? "#94A3B8" : "#64748B";

  const inner = `
    <tr><td style="${banner}">
      <div style="font-size:11px;letter-spacing:0.28em;font-weight:700;opacity:.88;color:${titleColor};">CHUNGHWA TELECOM TRAINING INSTITUTE</div>
      <div style="font-size:12px;margin-top:6px;opacity:.9;color:${titleColor};">中華電信學院｜課程推廣 EDM</div>
      <h1 style="margin:18px 0 0;font-size:30px;line-height:1.25;font-weight:800;letter-spacing:-0.02em;color:${titleColor};">${escapeHtml(headline)}</h1>
      <p style="margin:14px 0 0;font-size:16px;line-height:1.65;font-weight:500;color:${subColor};max-width:520px;">${escapeHtml(subheadline)}</p>
    </td></tr>
    <tr><td style="padding:22px 28px 0;background:${palette.background};">
      <img src="${visual.src}" alt="${visual.alt}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border-radius:14px;border:1px solid ${isDarkSurface(palette) ? "#334155" : "#E5E7EB"};box-shadow:0 18px 40px rgba(15,23,42,.12);" />
      <p style="margin:10px 0 0;font-size:11px;text-align:center;color:${capColor};line-height:1.5;">${escapeHtml(visual.caption)}</p>
    </td></tr>
    <tr><td style="padding:8px 28px 28px;background:${palette.background};color:${palette.text};">
      ${renderMandatoryGrid(input)}
      ${renderCourseContentBlock(input)}
      ${renderMarketingBlock(input)}
      ${renderOptionalSections(input)}
      ${renderExtraImages(input)}
      ${renderCta(input)}
      <p style="margin:28px 0 0;font-size:11px;line-height:1.6;color:${capColor};text-align:center;">
        本郵件由培訓師瑞士刀 EDM 產生器製作｜僅供內部訓練推廣使用<br/>
        若無法點選按鈕，請複製報名連結至瀏覽器開啟（請確認已於上方勾選「報名網址」欄位）
      </p>
    </td></tr>`;

  return wrapBase(input, inner);
}

function wrapBase(input: EdmTemplateInput, innerRows: string): string {
  const { palette } = input;
  const outerBg = isDarkSurface(palette) ? "#020617" : palette.secondary;
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.headline)}</title>
</head>
<body style="margin:0;padding:0;background:${outerBg};font-family:${defaultFont};-webkit-font-smoothing:antialiased;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${outerBg};padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="640" style="max-width:640px;width:100%;border-collapse:collapse;background:${palette.background};border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(15,23,42,.14);border:1px solid ${isDarkSurface(palette) ? "#1E293B" : "#E5E7EB"};">
          ${innerRows}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderClassic(input: EdmTemplateInput): string {
  return renderMagazineLayout(input, "classic");
}
function renderTech(input: EdmTemplateInput): string {
  return renderMagazineLayout(input, "tech");
}
function renderFresh(input: EdmTemplateInput): string {
  return renderMagazineLayout(input, "fresh");
}
function renderWarm(input: EdmTemplateInput): string {
  return renderMagazineLayout(input, "warm");
}

export const EDM_TEMPLATES: EdmTemplate[] = [
  { id: "classic", name: "經典學院風", description: "正式藍系｜大標＋資訊格＋內容區塊", render: renderClassic },
  { id: "tech", name: "活力科技風", description: "漸層主視覺｜偏新創海報語彙", render: renderTech },
  { id: "fresh", name: "簡潔清新風", description: "留白與線條｜易讀策展式排版", render: renderFresh },
  { id: "warm", name: "溫暖培訓風", description: "暖色激勵感｜適合軟性課程", render: renderWarm },
];

export function getTemplateById(templateId: string): EdmTemplate {
  return EDM_TEMPLATES.find((item) => item.id === templateId) || EDM_TEMPLATES[0];
}

export function getPaletteById(paletteId: string): ThemePalette {
  return EDM_PALETTES.find((item) => item.id === paletteId) || EDM_PALETTES[0];
}
