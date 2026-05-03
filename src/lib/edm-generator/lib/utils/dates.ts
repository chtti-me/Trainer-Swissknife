/**
 * 日期解析與格式化工具：
 * - 統一處理民國年（115 年）、西元年、中式（5 月 6 日）、ISO（2026-05-06）等多種輸入
 * - 支援同年份只顯示一次的智慧分群顯示
 */

export type YearFormat = 'roc' | 'gregorian';

export interface ParsedDate {
  /** 西元年（內部統一以西元儲存與比較） */
  year: number;
  month: number;
  day: number;
  /** ISO 格式 YYYY-MM-DD（可塞給 <input type="date"> 使用） */
  iso: string;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

const buildIso = (y: number, m: number, d: number): string =>
  `${y}-${pad2(m)}-${pad2(d)}`;

const finalize = (y: number, m: number, d: number): ParsedDate | null => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { year: y, month: m, day: d, iso: buildIso(y, m, d) };
};

/**
 * 嘗試解析任意常見格式：
 *   2026-05-06、2026/05/06、2026.05.06、2026年5月6日
 *   115年 05/06、115/05/06、115-05-06
 *   115年5月6日
 *   115年5月6日(三)
 */
export function parseAnyDate(raw: string): ParsedDate | null {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw
    .replace(/[（(].*?[)）]/g, '') // 去掉 (三)、（週一）這類括號註記
    .trim();
  if (!s) return null;

  // 1) 西元年 4 位 YYYY[-/.年] MM [-/.月] DD [日]?
  let m = s.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/);
  if (m) return finalize(+m[1], +m[2], +m[3]);

  // 2) 民國年帶「年」字 YYY 年 MM [-/.月] DD [日]?
  m = s.match(/(\d{1,3})\s*年\s*(\d{1,2})\s*[-/.月]?\s*(\d{1,2})\s*日?/);
  if (m && +m[1] >= 1 && +m[1] <= 200) {
    return finalize(+m[1] + 1911, +m[2], +m[3]);
  }

  // 3) 純數字 YYY[-/.] MM [-/.] DD：年份小於 200 視為民國年
  m = s.match(/^(\d{1,3})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const y = +m[1];
    if (y >= 1 && y <= 200) return finalize(y + 1911, +m[2], +m[3]);
    if (y >= 1900 && y <= 2999) return finalize(y, +m[2], +m[3]);
  }

  return null;
}

/**
 * 將任意格式日期字串轉成 ISO（YYYY-MM-DD）。
 * 解析失敗會原樣返回，避免破壞使用者輸入。
 */
export function toIsoDate(s: string): string {
  return parseAnyDate(s)?.iso ?? s;
}

/**
 * 西元年 → 顯示用字串。例：2026 在 ROC 模式下顯示為「115 年」
 */
export function formatYear(year: number, format: YearFormat): string {
  if (format === 'roc') return `${year - 1911} 年`;
  return `${year} 年`;
}

/**
 * 智慧格式化日期清單：
 *   - 同一年份只顯示一次：「115 年 05/06、05/13、05/20、05/27」
 *   - 跨年時依年份分群：「115 年 12/30、12/31；116 年 01/01、01/02」
 *   - display='range' 且為單年：「115 年 05/06 ~ 05/27（共 4 天）」
 *   - display='range' 且跨年：「115 年 12/30 ~ 116 年 01/02（共 4 天）」
 *
 * 解析失敗的字串會被忽略；若全部都解析不到，原樣輸出（用「、」串接）。
 */
export function formatDateList(
  dates: string[],
  opts: { display: 'range' | 'list'; yearFormat?: YearFormat } = {
    display: 'list',
  },
): string {
  if (!dates || dates.length === 0) return '—';
  const yearFormat = opts.yearFormat ?? 'roc';

  const parsed: ParsedDate[] = [];
  const unparsed: string[] = [];
  for (const d of dates) {
    if (!d || !d.trim()) continue;
    const p = parseAnyDate(d);
    if (p) parsed.push(p);
    else unparsed.push(d.trim());
  }
  if (parsed.length === 0) {
    // 完全無法解析 → 沿用使用者原始字串
    return unparsed.length > 0 ? unparsed.join('、') : '—';
  }

  parsed.sort(
    (a, b) => a.year - b.year || a.month - b.month || a.day - b.day,
  );

  const fmtMD = (p: ParsedDate): string => `${pad2(p.month)}/${pad2(p.day)}`;

  // range 模式：顯示首末日 + 共 N 天
  if (opts.display === 'range' && parsed.length > 1) {
    const first = parsed[0];
    const last = parsed[parsed.length - 1];
    if (first.year === last.year) {
      return `${formatYear(first.year, yearFormat)} ${fmtMD(first)} ~ ${fmtMD(last)}（共 ${parsed.length} 天）`;
    }
    return `${formatYear(first.year, yearFormat)} ${fmtMD(first)} ~ ${formatYear(last.year, yearFormat)} ${fmtMD(last)}（共 ${parsed.length} 天）`;
  }

  // list 模式：依年份分群（連續同年合併）
  const groups: Array<{ year: number; items: string[] }> = [];
  for (const p of parsed) {
    const last = groups[groups.length - 1];
    if (!last || last.year !== p.year) {
      groups.push({ year: p.year, items: [fmtMD(p)] });
    } else {
      last.items.push(fmtMD(p));
    }
  }

  return groups
    .map((g) => `${formatYear(g.year, yearFormat)} ${g.items.join('、')}`)
    .join('；');
}
