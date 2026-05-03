/**
 * 顏色工具集：
 * - hex ↔ HSL 互轉
 * - 從單一主色推導出 50–900 的色階
 * - 透明度疊加、混合等小工具
 *
 * 設計原則：
 * 1. 純函數，不依賴 React / DOM。
 * 2. 完全相容 Outlook：輸出全是 hex，沒有 hsl()/oklch()。
 * 3. 容錯：解析失敗會 fallback 到合理顏色，不丟例外。
 */

import type { ColorScale } from '@edm/types/theme';

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));

export interface HSL {
  h: number; // 0–360
  s: number; // 0–100
  l: number; // 0–100
}

export function hexToHsl(hex: string): HSL {
  const c = normalizeHex(hex);
  const r = parseInt(c.slice(1, 3), 16) / 255;
  const g = parseInt(c.slice(3, 5), 16) / 255;
  const b = parseInt(c.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function hslToHex({ h, s, l }: HSL): string {
  const sFrac = clamp(s, 0, 100) / 100;
  const lFrac = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * lFrac - 1)) * sFrac;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lFrac - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return (
    '#' +
    [r, g, b]
      .map((v) => clamp(v, 0, 255).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/** 把 #abc / #aabbcc / 帶不帶 # 都接受，回傳標準 #RRGGBB */
export function normalizeHex(hex: string): string {
  let s = (hex || '').trim();
  if (!s.startsWith('#')) s = '#' + s;
  if (s.length === 4) {
    s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) return '#000000';
  return s.toUpperCase();
}

/**
 * 從一個主色推導出視覺合理的 10 階色階。
 *
 * 思路：取得 H、根據目標 lightness（50→900 從 96% 降到 14%）重新組合。
 * 為了讓淺階更柔和、深階更飽和，飽和度也會微調：
 *   50–200：飽和度 *0.6（淺色不要太花）
 *   500：原色
 *   600–900：飽和度 *1.0~1.1（深色強化主色感）
 */
export function deriveScaleFromHex(hex: string): ColorScale {
  const base = hexToHsl(hex);

  // 各階目標 lightness 與飽和度倍率
  const stops: Array<{ key: keyof ColorScale; l: number; sMul: number }> = [
    { key: 50, l: 96, sMul: 0.55 },
    { key: 100, l: 92, sMul: 0.65 },
    { key: 200, l: 84, sMul: 0.75 },
    { key: 300, l: 72, sMul: 0.85 },
    { key: 400, l: 60, sMul: 0.95 },
    { key: 500, l: clampLightness(base.l), sMul: 1.0 },
    { key: 600, l: 38, sMul: 1.0 },
    { key: 700, l: 28, sMul: 1.05 },
    { key: 800, l: 20, sMul: 1.05 },
    { key: 900, l: 13, sMul: 1.1 },
  ];

  const scale = {} as ColorScale;
  for (const stop of stops) {
    scale[stop.key] = hslToHex({
      h: base.h,
      s: clamp(base.s * stop.sMul, 0, 100),
      l: stop.l,
    });
  }
  return scale;
}

/** 主色亮度若已偏暗或偏亮，500 保留原值；否則套用我們的目標 */
function clampLightness(l: number): number {
  if (l < 30) return l + 10; // 太暗就讓它在 500 階稍微亮一點
  if (l > 70) return l - 10; // 太亮就讓它稍微暗一點
  return l;
}

/** 與背景混合產生「半透明覆蓋」效果（Outlook 不支援 rgba 疊加，要先算好實心色） */
export function mixHex(fg: string, bg: string, alpha: number): string {
  const a = clamp(alpha, 0, 1);
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  return (
    '#' +
    [
      Math.round(f.r * a + b.r * (1 - a)),
      Math.round(f.g * a + b.g * (1 - a)),
      Math.round(f.b * a + b.b * (1 - a)),
    ]
      .map((v) => clamp(v, 0, 255).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): RGB {
  const c = normalizeHex(hex);
  return {
    r: parseInt(c.slice(1, 3), 16),
    g: parseInt(c.slice(3, 5), 16),
    b: parseInt(c.slice(5, 7), 16),
  };
}

/** 判斷一個色是否偏深（用來決定文字要白還是黑） */
export function isDarkHex(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma < 128;
}

/** 在背景上要選白色或黑色文字 */
export function readableOn(bg: string): string {
  return isDarkHex(bg) ? '#FFFFFF' : '#0A0A0A';
}
