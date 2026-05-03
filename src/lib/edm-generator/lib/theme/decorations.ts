/**
 * 裝飾性背景圖產生器：
 * - 以 inline SVG 撰寫各種裝飾元素（漸層光暈、波浪、斜切色塊…）
 * - 編碼為 data URI（utf8 SVG，現代客戶端直接吃 SVG；Outlook 不支援 SVG 會直接顯示 alt/底色，
 *   因此呼叫端必須在外層 td 也設定 background-color 做為合理 fallback）
 *
 * 這層是「視覺差異化」的一個關鍵砲彈：用看起來精緻、實際成本極低的 SVG，
 * 一次幫所有模板增加設計感，又不會讓 PNG 匯出體積爆炸。
 */

const enc = (svg: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;

/** Hero 角落漸層光暈（modern 用）：右上方圓型大光暈 */
export function buildCornerBlobSvg(
  primaryHex: string,
  accentHex: string,
  width = 640,
  height = 260,
): string {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <radialGradient id="g1" cx="80%" cy="20%" r="60%">
      <stop offset="0%" stop-color="${accentHex}" stop-opacity="0.6"/>
      <stop offset="60%" stop-color="${primaryHex}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${primaryHex}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="10%" cy="90%" r="50%">
      <stop offset="0%" stop-color="${primaryHex}" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="${primaryHex}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g1)"/>
  <rect width="100%" height="100%" fill="url(#g2)"/>
</svg>`;
  return enc(svg);
}

/** 學術頂部三色彩帶（紅/金/藍） */
export function buildTriBandSvg(
  c1: string,
  c2: string,
  c3: string,
  width = 640,
  height = 6,
): string {
  const w = width / 3;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${w}" height="${height}" fill="${c1}"/>
  <rect x="${w}" y="0" width="${w}" height="${height}" fill="${c2}"/>
  <rect x="${w * 2}" y="0" width="${w}" height="${height}" fill="${c3}"/>
</svg>`;
  return enc(svg);
}

/** 活潑斜切色塊（Vibrant 用） */
export function buildDiagonalBlocksSvg(
  c1: string,
  c2: string,
  c3: string,
  width = 640,
  height = 240,
): string {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
  <polygon points="0,0 ${width * 0.55},0 ${width * 0.35},${height} 0,${height}" fill="${c1}"/>
  <polygon points="${width * 0.55},0 ${width},0 ${width},${height} ${width * 0.35},${height}" fill="${c2}"/>
  <circle cx="${width * 0.85}" cy="${height * 0.25}" r="${height * 0.12}" fill="${c3}" opacity="0.85"/>
  <circle cx="${width * 0.15}" cy="${height * 0.78}" r="${height * 0.08}" fill="${c3}" opacity="0.6"/>
</svg>`;
  return enc(svg);
}

/** 波浪型分隔（Vibrant divider 用） */
export function buildWaveDividerSvg(
  color: string,
  width = 640,
  height = 36,
): string {
  // 兩個 cubic 連接的 wave
  const mid = height / 2;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
  <path d="M 0 ${mid} C ${width * 0.2} 0, ${width * 0.3} ${height}, ${width * 0.5} ${mid} S ${width * 0.8} 0, ${width} ${mid}"
    fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
</svg>`;
  return enc(svg);
}

/** 漸層條（modern divider 用） */
export function buildGradientBarSvg(
  c1: string,
  c2: string,
  width = 640,
  height = 6,
): string {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)" rx="${height / 2}" ry="${height / 2}"/>
</svg>`;
  return enc(svg);
}

/** 點陣裝飾（minimal 細節） */
export function buildDotGridSvg(
  color: string,
  width = 96,
  height = 24,
): string {
  const dots: string[] = [];
  const spacing = 12;
  for (let x = 6; x <= width - 6; x += spacing) {
    for (let y = 6; y <= height - 6; y += spacing) {
      dots.push(`<circle cx="${x}" cy="${y}" r="1.5" fill="${color}"/>`);
    }
  }
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${dots.join('')}
</svg>`;
  return enc(svg);
}
