// 注意：本檔為純函式 parser（無 IO、無 DB、無 process.env 依賴），故未加 `import "server-only"`，
// 以方便用 tsx 離線驗證腳本（scripts/test-tis-parser.ts）直接 import 驗證 12 月份 HTML。
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

/**
 * 【TIS 開班計畫表 HTML Parser】
 *
 * 解析從 TIS 「開班計畫表列表頁」（OpenClass_ClassList2.jsp）抓回來 / 另存的 HTML，
 * 抽出該月所有班次基本資料。
 *
 * 設計原則：
 *   - 純函式、無 IO、無 DB；給 ingest API 使用
 *   - 盡量寬容：欄位缺失只標記 null，不整批 fail
 *   - 對未知欄位以 raw 字串保存，方便日後驗屍
 *
 * 對照 schema：src/lib/tis-class-code.ts 已有 `enrichImportedClassRow`
 * 可進一步補齊 campus / category / difficultyLevel 等。本 parser 只負責「拆 HTML」。
 */

export interface TisParsedClass {
  /** 完整九/十碼班代號（已 trim、upper） */
  classCode: string;
  /** 班名（已去除 ` (C)` 體系別括號的乾淨版） */
  className: string;
  /** 體系別括號內容（例如 `C`、`U`、`G`），無則 null */
  academyStream: string | null;
  /** 第一格班代號 cell 內額外 inline 標籤，例如「(計畫)」「(純直播課程)」 */
  inlineTags: string[];
  /** 開班日期（西元 ISO yyyy-mm-dd），無法解析則 null */
  startDate: string | null;
  /** 狀態文字，例如「已核定」「已報名」「未報名」 */
  status: string | null;
  /** 導師姓名（status 後括號內名字） */
  mentorName: string | null;
  /** 「已報名(N)」原文 */
  enrollmentText: string | null;
  /** 解析自 enrollmentText 的數字（無則 null） */
  enrollmentCount: number | null;
  /** 處理欄各個連結 URL（key 為該連結文字） */
  links: Record<string, string>;
  /** 從 planform URL query 抓出的 seq（TIS 唯一序號）；上層 upsert 用 */
  tisSeq: string | null;
  /** 從 planform URL query 抓出的 sdate（民國日期，原樣）作 cross check */
  rawSdate: string | null;
  /** 該班所屬區塊標題：例如「115/01/01~115/01/31(板橋)(資訊體系)開班 共28班」 */
  sectionTitle: string | null;
  /** sectionTitle 中括號之一：場域中文，例如「板橋」「台中」「高雄」「全e」 */
  sectionVenue: string | null;
  /** sectionTitle 中括號之二：體系名稱，例如「資訊體系」「管理體系」 */
  sectionDomain: string | null;
}

export interface TisParsedPage {
  /** TIS URL query 解析得到的年份（西元） */
  yy: number | null;
  /** TIS URL query 解析得到的月份 */
  mm: number | null;
  /** TIS URL query 解析得到的院所代碼（P/T/K/E） */
  department: string | null;
  /** 該頁標題，例如「115 年1 月 開班計畫表」 */
  pageTitle: string | null;
  /** TIS 「使用者：XXX」字樣 */
  loginUser: string | null;
  /** 該頁所有班次 */
  classes: TisParsedClass[];
  /** 解析過程的軟錯誤（不致命，給 UI 顯示供管理員除錯） */
  warnings: string[];
}

const STREAM_RE = /\s*[\(（]\s*([A-Za-z\u4e00-\u9fff]{1,8})\s*[\)）]\s*$/;
const ROC_DATE_RE = /^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/;
const ENROLL_COUNT_RE = /\((\d+)\)/;
const SECTION_TITLE_RE =
  /^([0-9/]+)\s*~\s*([0-9/]+)\s*\(([^)]+)\)\s*\(([^)]+)\)\s*開班\s*(?:共\s*(\d+)\s*班)?/;

function rocToIsoDate(roc: string | null | undefined): string | null {
  if (!roc) return null;
  const m = roc.trim().match(ROC_DATE_RE);
  if (!m) return null;
  const yyRoc = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const dd = parseInt(m[3], 10);
  if (!Number.isFinite(yyRoc) || !Number.isFinite(mm) || !Number.isFinite(dd)) return null;
  const yyAd = yyRoc + 1911;
  return `${yyAd.toString().padStart(4, "0")}-${mm.toString().padStart(2, "0")}-${dd
    .toString()
    .padStart(2, "0")}`;
}

function safeUrlParam(url: string | null | undefined, key: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const v = u.searchParams.get(key);
    return v ? v.trim() : null;
  } catch {
    // 處理 TIS 偶爾出現的相對 URL / 非標準 escape
    const m = new RegExp(`[?&]${key}=([^&#]+)`).exec(url);
    return m ? decodeURIComponent(m[1]).trim() : null;
  }
}

function squishWhitespace(s: string | null | undefined): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

function extractInlineTags(text: string): string[] {
  const tags: string[] = [];
  const re = /[\(（]([^()（）]{1,20})[\)）]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const t = `(${m[1].trim()})`;
    if (t.length > 2 && t.length < 30) tags.push(t);
  }
  return tags;
}

/**
 * 解析時可選的「外部 hint」。
 *
 * 為什麼需要：TIS 開班計畫表頁面 (OpenClass_ClassList2.jsp) **沒有 canonical link**，
 * 內部連結也都是相對路徑，導致純看 HTML 內容時無法回推原本請求的 yy/mm/department。
 * Bookmarklet 在抓取時已經把這些資訊都嵌在「檔名（例：`2026_1_deptP.html`）」與「sourceUrl」裡，
 * 只要呼叫端把 hint 一起傳進來，parser 就可以做 fallback，避免讓使用者看到一堆嚇人警告。
 */
export interface ParseHtmlOptions {
  /** 該 HTML 來源 URL（若有），用來在 HTML 內找不到自指 URL 時 fallback 解析 yy/mm/department */
  urlHint?: string;
  /**
   * 該 HTML 來源檔名（若有），用來進一步 fallback。
   * 認得 bookmarklet 的命名格式 `${year}_${mm}_dept${P|T|K|E}.html`。
   */
  fileNameHint?: string;
}

/** Bookmarklet 端 results.push({ name: year + '_' + mm + '_dept' + dept + '.html', ... }) 對應的反解析 */
const FILENAME_HINT_RE = /(?:^|[\\\/])(\d{4})[_-](\d{1,2})[_-]?dept([PTKE])\b/i;

function parsePageMeta(
  $: cheerio.CheerioAPI,
  opts?: ParseHtmlOptions
): {
  yy: number | null;
  mm: number | null;
  department: string | null;
  pageTitle: string | null;
  loginUser: string | null;
  warnings: string[];
} {
  const warnings: string[] = [];

  // 1. 主路：從 <link rel=canonical> 或 <meta> 取 URL → 取 query
  let url = $('link[rel="canonical"]').attr("href") || "";
  if (!url) {
    // 1a. 退路：搜全文找一段帶 OpenClass_ClassList2.jsp 的 URL
    const html = $.html();
    const m = html.match(/https?:\/\/tis\.cht\.com\.tw[^"'\s<>]+OpenClass_ClassList2\.jsp[^"'\s<>]*/);
    if (m) url = m[0];
  }
  // 1b. 退路：呼叫端提供的 sourceUrl（例如 bookmarklet location.href）
  if (!url && opts?.urlHint) {
    url = opts.urlHint;
  }

  let yy: string | null = url ? safeUrlParam(url, "yy") : null;
  let mm: string | null = url ? safeUrlParam(url, "mm") : null;
  let department: string | null = url ? safeUrlParam(url, "department") : null;

  // 2. 最後退路：bookmarklet 自己刻的檔名 `2026_1_deptP.html` 帶足三個欄位
  //    （TIS 頁面實測無 canonical 也無自指絕對 URL，這條 fallback 是必須的，否則使用者每次都會看到 12 條警告）
  if ((!yy || !mm || !department) && opts?.fileNameHint) {
    const fm = opts.fileNameHint.match(FILENAME_HINT_RE);
    if (fm) {
      if (!yy) yy = fm[1];
      if (!mm) mm = fm[2];
      if (!department) department = fm[3].toUpperCase();
    }
  }

  // 頁標題：通常是 h3 內 font color=#0000FF
  const pageTitle = squishWhitespace($("h3").first().text()) || null;

  // 「(使用者：XXX)」
  const userMatch = $.html().match(/使用者[:：]\s*([^\)\s<]+)/);
  const loginUser = userMatch ? userMatch[1].trim() : null;

  if (!yy)
    warnings.push(
      "無法解析 yy（HTML 內無 canonical link、無自指絕對 URL，且呼叫端未提供檔名 / urlHint）"
    );
  if (!mm) warnings.push("無法解析 mm");
  if (!department) warnings.push("無法解析 department");

  return {
    yy: yy ? parseInt(String(yy), 10) : null,
    mm: mm ? parseInt(String(mm), 10) : null,
    department: department ?? null,
    pageTitle,
    loginUser,
    warnings,
  };
}

/**
 * 解析一個「資料 row」（<tr height=30>）為 TisParsedClass。
 * 失敗（td 數量不對、班代號為空等）回 null，呼叫端略過。
 */
function parseDataRow(
  $: cheerio.CheerioAPI,
  $tr: cheerio.Cheerio<AnyNode>,
  sectionMeta: { title: string | null; venue: string | null; domain: string | null }
): TisParsedClass | null {
  const $tds = $tr.find("> td");
  if ($tds.length < 5) return null;

  // [0] 班代號 cell（內含換行與 inline 標籤）
  // 注意：未建置班次的代號可能只有 6 碼（5 碼 classid + 1 碼場域，期別尚未配發），
  //      已建置班次則為標準 9 碼或擴充 10 碼。為了能收到「未建置」班次（有規劃意義），
  //      regex 下限放到 6 碼。
  const code0Raw = squishWhitespace($tds.eq(0).text());
  const inlineTags = extractInlineTags(code0Raw);
  const code0Clean = code0Raw.replace(/[\(（][^()（）]{1,20}[\)）]/g, "").trim();
  const classCode = (code0Clean.match(/^([A-Z0-9]{6,12})/i)?.[1] || "").toUpperCase();
  if (!classCode) return null;

  // [1] 班名 cell
  const nameRaw = squishWhitespace($tds.eq(1).text());
  const streamMatch = nameRaw.match(STREAM_RE);
  const academyStream = streamMatch ? streamMatch[1].trim() : null;
  const className = streamMatch ? nameRaw.replace(STREAM_RE, "").trim() : nameRaw;

  // [2] 開班日期（民國）
  const dateRaw = squishWhitespace($tds.eq(2).text());
  const startDate = rocToIsoDate(dateRaw);

  // [3] 狀態(導師)＋報名資訊
  const statusCellHtml = $tds.eq(3).html() || "";
  const statusCellText = squishWhitespace($tds.eq(3).text());
  // 狀態：前段非空文字
  let status: string | null = null;
  let mentorName: string | null = null;
  let enrollmentText: string | null = null;
  // 嘗試結構化拆解：「已核定」 「( 黃鴻儒 )」 「已報名(9)」
  const statusMatch = statusCellText.match(/^([^\(（]+?)\s*[\(（]\s*([^\)）]+?)\s*[\)）]\s*(.*)$/);
  if (statusMatch) {
    status = statusMatch[1].trim() || null;
    mentorName = statusMatch[2].trim() || null;
    enrollmentText = statusMatch[3].trim() || null;
  } else {
    // 沒有導師欄（少見）；整段當 status
    status = statusCellText || null;
  }
  // 後面段裡找「已報名(N)」
  const enrollMatch = (enrollmentText || statusCellText).match(/已報名[\(（](\d+)[\)）]/);
  const enrollmentCount = enrollMatch ? parseInt(enrollMatch[1], 10) : null;
  if (enrollmentText == null && enrollMatch) enrollmentText = `已報名(${enrollMatch[1]})`;
  // 防止 statusCellHtml 警告：保留以利未來除錯
  void statusCellHtml;

  // [4] 處理欄連結
  const links: Record<string, string> = {};
  $tds
    .eq(4)
    .find("a[href]")
    .each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = squishWhitespace($(el).text())
        .replace(/^\[/, "")
        .replace(/\]$/, "")
        .trim();
      if (text && !links[text]) links[text] = href;
    });

  // 從 planform URL 抽 seq、sdate
  const planformUrl = links["查詢(列印)"] || Object.values(links).find((u) => u.includes("planformQa")) || "";
  const tisSeq = safeUrlParam(planformUrl, "seq");
  const rawSdate = safeUrlParam(planformUrl, "sdate");

  return {
    classCode,
    className,
    academyStream,
    inlineTags,
    startDate,
    status,
    mentorName,
    enrollmentText,
    enrollmentCount,
    links,
    tisSeq,
    rawSdate,
    sectionTitle: sectionMeta.title,
    sectionVenue: sectionMeta.venue,
    sectionDomain: sectionMeta.domain,
  };
}

/**
 * 主入口：吃 HTML 字串，回 TisParsedPage。
 * 不會拋例外（除非 HTML 完全不是 string）；解析錯誤都記在 warnings。
 *
 * @param opts 呼叫端可額外提供 fileNameHint / urlHint，給 yy/mm/department fallback 用
 */
export function parseTisOpenClassListHtml(
  html: string,
  opts?: ParseHtmlOptions
): TisParsedPage {
  if (typeof html !== "string" || html.length < 100) {
    return {
      yy: null,
      mm: null,
      department: null,
      pageTitle: null,
      loginUser: null,
      classes: [],
      warnings: ["HTML 字串為空或過短，無法解析"],
    };
  }

  const $ = cheerio.load(html);
  const meta = parsePageMeta($, opts);
  const classes: TisParsedClass[] = [];

  // TIS 結構：每個「區塊」是一個外層 <table>，內含一個藍色 header（區塊標題）
  // 與一個內嵌 <table>，內嵌表的第一個 <tr> 是欄位 header，後續 <tr height=30> 是資料 row。
  // 我們直接掃所有 `<tr height="30">` 並回頭找該 row 所屬的「藍色 header」最近祖先。
  const dataRows = $("tr").filter((_, el) => {
    const h = $(el).attr("height");
    return h === "30" || h === "30px";
  });

  dataRows.each((_, el) => {
    const $tr = $(el);
    // 該 row 所屬區塊：往上找帶有 `bgcolor="#0000FF"` 的 td，取它的 text 當區塊標題
    const $section = $tr
      .closest("table")
      .parents("table")
      .first()
      .find('td[bgcolor="#0000FF"]')
      .first();
    const rawTitle = squishWhitespace($section.text()) || null;

    let venue: string | null = null;
    let domain: string | null = null;
    if (rawTitle) {
      const m = rawTitle.match(SECTION_TITLE_RE);
      if (m) {
        venue = m[3].trim();
        domain = m[4].trim();
      }
    }

    const parsed = parseDataRow($, $tr, { title: rawTitle, venue, domain });
    if (parsed) classes.push(parsed);
  });

  // 去重：同個 classCode + tisSeq 視為同一筆，後出現的覆蓋（HTML 內理論上不會重複，防呆而已）
  const dedup = new Map<string, TisParsedClass>();
  for (const c of classes) {
    const key = `${c.classCode}|${c.tisSeq ?? ""}`;
    dedup.set(key, c);
  }

  return {
    ...meta,
    classes: Array.from(dedup.values()),
    warnings: meta.warnings,
  };
}

/**
 * 多檔合併：吃多份 HTML，回合併後 page list + 統計資訊。
 * 主要給 ingest API 用。
 */
export interface ParseManyResult {
  pages: TisParsedPage[];
  /** 全部 page 合併後去重的班次（key = classCode|tisSeq） */
  mergedClasses: TisParsedClass[];
  totalPages: number;
  totalRowsParsed: number;
  totalDuplicatesAcrossPages: number;
}

export interface ParseManyTisHtmlItem extends ParseHtmlOptions {
  html: string;
}

/**
 * 同時支援兩種輸入：
 *   - `string[]`（舊用法，向後相容；test 腳本 / CSV 直接吃 HTML 字串）
 *   - `ParseManyTisHtmlItem[]`（推薦，附帶 fileNameHint / urlHint，可避免無謂的解析警告）
 */
export function parseManyTisHtml(
  items: ReadonlyArray<string | ParseManyTisHtmlItem>
): ParseManyResult {
  const pages: TisParsedPage[] = [];
  const merged = new Map<string, TisParsedClass>();
  let totalRowsParsed = 0;
  let dupes = 0;

  for (const item of items) {
    const isStr = typeof item === "string";
    const html = isStr ? item : item.html;
    const opts: ParseHtmlOptions | undefined = isStr
      ? undefined
      : { urlHint: item.urlHint, fileNameHint: item.fileNameHint };
    const page = parseTisOpenClassListHtml(html, opts);
    pages.push(page);
    totalRowsParsed += page.classes.length;
    for (const c of page.classes) {
      const key = `${c.classCode}|${c.tisSeq ?? ""}`;
      if (merged.has(key)) {
        dupes++;
      }
      merged.set(key, c);
    }
  }

  return {
    pages,
    mergedClasses: Array.from(merged.values()),
    totalPages: pages.length,
    totalRowsParsed,
    totalDuplicatesAcrossPages: dupes,
  };
}
