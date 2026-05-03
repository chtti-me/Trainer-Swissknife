export type GeoPattern = 'gradient' | 'mesh' | 'waves' | 'grid' | 'dots' | 'blob' | 'lines';

export interface GeoOpts {
  pattern: GeoPattern;
  width: number;
  height: number;
  primary: string;
  accent: string;
  bg?: string;
}

export function generateGeoSvg(opts: GeoOpts): string {
  const { pattern, width, height, primary, accent, bg = '#0F172A' } = opts;

  switch (pattern) {
    case 'gradient':
      return wrap(
        width,
        height,
        `
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${primary}" />
            <stop offset="100%" stop-color="${accent}" />
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#g)" />
        <circle cx="${width * 0.8}" cy="${height * 0.2}" r="${height * 0.4}" fill="white" opacity="0.12" />
        <circle cx="${width * 0.2}" cy="${height * 0.8}" r="${height * 0.5}" fill="${accent}" opacity="0.25" />
      `,
      );
    case 'mesh':
      return wrap(
        width,
        height,
        `
        <defs>
          <radialGradient id="r1" cx="20%" cy="30%" r="50%"><stop offset="0%" stop-color="${primary}" stop-opacity="0.9"/><stop offset="100%" stop-color="${primary}" stop-opacity="0"/></radialGradient>
          <radialGradient id="r2" cx="80%" cy="70%" r="55%"><stop offset="0%" stop-color="${accent}" stop-opacity="0.9"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/></radialGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="${bg}" />
        <rect width="${width}" height="${height}" fill="url(#r1)" />
        <rect width="${width}" height="${height}" fill="url(#r2)" />
      `,
      );
    case 'waves':
      return wrap(
        width,
        height,
        `
        <rect width="${width}" height="${height}" fill="${bg}" />
        ${[0, 1, 2]
          .map((i) => {
            const y = (height * (i + 1)) / 4;
            const color = i === 1 ? accent : primary;
            return `<path d="M0,${y} C${width * 0.25},${y - 30} ${width * 0.5},${y + 30} ${width},${y - 10} L${width},${height} L0,${height} Z" fill="${color}" opacity="${0.4 - i * 0.1}" />`;
          })
          .join('')}
      `,
      );
    case 'grid':
      return wrap(
        width,
        height,
        `
        <rect width="${width}" height="${height}" fill="${bg}" />
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0 L0 0 0 40" fill="none" stroke="${primary}" stroke-opacity="0.25" stroke-width="1" />
          </pattern>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#grid)" />
        <circle cx="${width * 0.7}" cy="${height * 0.4}" r="${height * 0.25}" fill="${accent}" opacity="0.5" />
      `,
      );
    case 'dots':
      return wrap(
        width,
        height,
        `
        <rect width="${width}" height="${height}" fill="${bg}" />
        <defs>
          <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="2" fill="${primary}" opacity="0.5" />
          </pattern>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#dots)" />
        <rect x="${width * 0.6}" y="0" width="${width * 0.4}" height="${height}" fill="${accent}" opacity="0.6" />
      `,
      );
    case 'blob':
      return wrap(
        width,
        height,
        `
        <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${primary}"/><stop offset="100%" stop-color="${accent}"/></linearGradient></defs>
        <rect width="${width}" height="${height}" fill="${bg}"/>
        <path d="M${width * 0.1},${height * 0.4} C${width * 0.2},${height * 0.1} ${width * 0.6},${height * 0.05} ${width * 0.85},${height * 0.3} C${width * 1.05},${height * 0.55} ${width * 0.9},${height * 0.95} ${width * 0.5},${height * 0.95} C${width * 0.1},${height * 0.95} ${width * 0.05},${height * 0.65} ${width * 0.1},${height * 0.4} Z" fill="url(#bg)" opacity="0.85" />
      `,
      );
    case 'lines':
      return wrap(
        width,
        height,
        `
        <rect width="${width}" height="${height}" fill="${bg}"/>
        ${Array.from({ length: 16 })
          .map((_, i) => {
            const x = (width / 16) * i;
            return `<line x1="${x}" y1="0" x2="${x + width * 0.3}" y2="${height}" stroke="${i % 3 === 0 ? accent : primary}" stroke-opacity="0.35" stroke-width="1.5"/>`;
          })
          .join('')}
      `,
      );
  }
}

function wrap(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body}</svg>`;
}

export function svgToDataUrl(svg: string): string {
  const encoded = encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22');
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

export const PATTERNS: Array<{ id: GeoPattern; label: string }> = [
  { id: 'gradient', label: '漸層' },
  { id: 'mesh', label: '網狀' },
  { id: 'waves', label: '波浪' },
  { id: 'grid', label: '網格' },
  { id: 'dots', label: '點陣' },
  { id: 'blob', label: '柔形' },
  { id: 'lines', label: '線條' },
];
