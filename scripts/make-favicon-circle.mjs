/**
 * 把 icon.png 裁成正圓形，圓外完全透明。
 * 在 WSL 裡執行：node scripts/make-favicon-circle.mjs
 */
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src  = path.join(root, 'src', 'app', 'icon.png');
const out  = path.join(root, 'src', 'app', 'icon.png');

// 先取得圖片尺寸
const meta = await sharp(src).metadata();
const size = Math.min(meta.width, meta.height);

// SVG 圓形遮罩（白色填滿 = 保留，黑色 = 透明）
const mask = Buffer.from(
  `<svg><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`
);

await sharp(src)
  .resize(size, size, { fit: 'cover', position: 'centre' })
  .composite([{ input: mask, blend: 'dest-in' }])
  .png()
  .toFile(out + '.tmp.png');

// 用 tmp 覆蓋原檔
import { rename } from 'fs/promises';
await rename(out + '.tmp.png', out);

console.log(`✓ favicon 已裁為 ${size}×${size} 圓形，儲存至 ${out}`);
