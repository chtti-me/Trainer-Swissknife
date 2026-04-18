/**
 * 【開班計畫表 HTML → 結構化列】
 * 解析另存成檔的網頁表格，抽出班代號、班名、導師、狀態等（給 generate-y115… 與種子用）。
 * 比喻：從 PDF 表格抄到 Excel，只是用程式自動抄。
 * 來源：docs/reference-materials/…/115年開班計畫表/*.html
 */

export type ParsedOpenClassRow = {
  classCode: string;
  className: string;
  /** 民國 115 年之 MM/DD */
  rocDate: string;
  /** TIS seq，作為 sourceSystemId */
  seq: string;
  /** 連結上的 department，如 P|T|K|E */
  department: string | null;
  campusFromSection: string;
  statusRaw: string;
  /** TIS「導師」＝開班導師／培訓師（Trainer 名冊來源）；授課講師另存於班次 instructorNames，本表通常無此欄 */
  mentorName: string | null;
  enrolledCount: number | null;
  isPlanClass: boolean;
  tags: string[];
  sourceFile: string;
};

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 九碼：前五碼 classid（可含數字）+ 場域 P|T|K|E + 三位期別 */
const CODE_RE = /([A-Z0-9]{5})([PTKE])(\d{3})/i;

function campusFromLocationToken(loc: string): string {
  if (loc.includes("板橋")) return "院本部";
  if (loc.includes("台中")) return "台中所";
  if (loc.includes("高雄")) return "高雄所";
  return "院本部";
}

/** 從單一 `<tr height=30>...</tr>` 解析；若無班代號則回 null */
export function parseOpenClassTableRow(trHtml: string, sectionCampus: string, sourceFile: string): ParsedOpenClassRow | null {
  if (trHtml.includes("班代號")) return null;

  const firstCell = trHtml.match(/<td[^>]*width=14%[^>]*>([\s\S]*?)<\/td>/i);
  const secondCell = trHtml.match(/<td[^>]*width=32%[^>]*>([\s\S]*?)<\/td>/i);
  const thirdCell = trHtml.match(/<td[^>]*width=8%[^>]*>([\s\S]*?)<\/td>/i);
  const fourthCell = trHtml.match(/<td[^>]*width=15%[^>]*>([\s\S]*?)<\/td>/i);
  if (!firstCell || !secondCell || !thirdCell || !fourthCell) return null;

  const codeMatch = firstCell[1].match(CODE_RE);
  if (!codeMatch) return null;
  const classCode = `${codeMatch[1]}${codeMatch[2]}${codeMatch[3]}`.toUpperCase();

  let className = stripTags(secondCell[1]);
  className = className.replace(/\s*\([A-Z]\)\s*$/, "").trim();

  const dateText = stripTags(thirdCell[1]);
  const rocM = dateText.match(/115\/(\d{2})\/(\d{2})/);
  if (!rocM) return null;
  const rocDate = `${rocM[1]}/${rocM[2]}`;

  const statusBlock = fourthCell[1];
  const statusFlat = stripTags(statusBlock);
  let statusRaw = "已核定";
  if (/__未核定__|未核定/.test(statusFlat)) statusRaw = "未核定";
  else if (/已核定/.test(statusFlat)) statusRaw = "已核定";

  let mentorName: string | null = null;
  const mentorM = statusBlock.match(/\(\s*([^)]+?)\s*\)/);
  if (mentorM) {
    const m = mentorM[1].replace(/<[^>]+>/g, "").trim();
    if (m && !/已報名|核定|狀態/.test(m)) mentorName = m;
  }

  let enrolledCount: number | null = null;
  const enM = statusFlat.match(/已報名\s*\(\s*(\d+)\s*\)/);
  if (enM) enrolledCount = parseInt(enM[1], 10);

  const isPlanClass = /\(計畫\)/.test(firstCell[1]);
  const tags: string[] = [];
  if (/\(純直播課程\)/.test(firstCell[1])) tags.push("純直播課程");
  if (/\(三所遠距\)/.test(firstCell[1])) tags.push("三所遠距");
  if (/\(中央端\)/.test(firstCell[1])) tags.push("中央端");

  const planLink = trHtml.match(
    /OpenClass_planformQa\.jsp\?[^"']*seq=(\d+)[^"']*department=([PTKE])/i
  );
  const seq = planLink?.[1] ?? trHtml.match(/seq=(\d+)/i)?.[1];
  if (!seq) return null;
  const department = planLink?.[2]?.toUpperCase() ?? trHtml.match(/department=([PTKE])/i)?.[1]?.toUpperCase() ?? null;

  return {
    classCode,
    className,
    rocDate,
    seq,
    department,
    campusFromSection: sectionCampus,
    statusRaw,
    mentorName,
    enrolledCount,
    isPlanClass,
    tags,
    sourceFile,
  };
}

/** 解析整份 HTML 字串（僅以藍色標題列 height=30 分段，略過表尾「合計」列） */
export function parseOpenClassHtmlDocument(html: string, sourceFile: string): ParsedOpenClassRow[] {
  const out: ParsedOpenClassRow[] = [];
  const parts = html.split(/<td\s+bgcolor=#0000FF\s+height=30>/i);

  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const locM = chunk.match(/\((板橋|台中|高雄)[^)]*\)/);
    const sectionCampus = locM ? campusFromLocationToken(locM[1]) : "院本部";

    const trRe = /<tr\s+height=30>([\s\S]*?)<\/tr>/gi;
    let m: RegExpExecArray | null;
    while ((m = trRe.exec(chunk)) !== null) {
      const row = parseOpenClassTableRow(`<tr height=30>${m[1]}</tr>`, sectionCampus, sourceFile);
      if (row) out.push(row);
    }
  }

  return out;
}
