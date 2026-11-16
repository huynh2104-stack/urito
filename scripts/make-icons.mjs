/* Generates the PWA PNG icons with zero dependencies: a tiny rasteriser plus
 * Node's built-in zlib, so `npm install` stays small and the build stays offline. */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(OUT, { recursive: true });

const TOP = [91, 123, 255];
const BOTTOM = [32, 56, 184];
const WHITE = [255, 255, 255];
const DOT = [255, 206, 58];

const clamp01 = (v) => Math.min(1, Math.max(0, v));
/** 1 inside the shape, 0 outside, smoothly blended over one pixel. */
const cover = (d) => clamp01(0.5 - d);

function roundedRect(x, y, w, h, r) {
  const dx = Math.abs(x - w / 2) - (w / 2 - r);
  const dy = Math.abs(y - h / 2) - (h / 2 - r);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(ax, ay) - r;
}

function segment(px, py, ax, ay, bx, by, thickness) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const t = clamp01((wx * vx + wy * vy) / (vx * vx + vy * vy || 1));
  return Math.hypot(wx - vx * t, wy - vy * t) - thickness;
}

function arcBottom(px, py, cx, cy, radius, thickness) {
  const d = Math.abs(Math.hypot(px - cx, py - cy) - radius) - thickness;
  return py < cy ? Math.max(d, cy - py) : d;
}

function blend(dst, src, a) {
  for (let i = 0; i < 3; i++) dst[i] = Math.round(dst[i] * (1 - a) + src[i] * a);
}

function render(size) {
  const px = new Uint8Array(size * size * 4);
  const s = size / 512;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x + 0.5;
      const fy = y + 0.5;
      const bgA = cover(roundedRect(fx, fy, size, size, 128 * s));
      const px4 = (y * size + x) * 4;
      if (bgA <= 0) continue;
      const k = clamp01((fy / size) * 0.85 + (fx / size) * 0.15);
      const rgb = TOP.map((c, i) => Math.round(c + (BOTTOM[i] - c) * k));

      const stroke = 52 * s / 2;
      const left = segment(fx, fy, 152 * s, 120 * s, 152 * s, 280 * s, stroke);
      const right = segment(fx, fy, 360 * s, 120 * s, 360 * s, 280 * s, stroke);
      const bowl = arcBottom(fx, fy, 256 * s, 280 * s, 104 * s, stroke);
      const uA = cover(Math.min(left, right, bowl));
      if (uA > 0) blend(rgb, WHITE, uA);

      const barA = cover(roundedRect(fx - 168 * s, fy - 400 * s, 176 * s, 36 * s, 18 * s));
      if (barA > 0) blend(rgb, DOT, barA);

      px[px4] = rgb[0];
      px[px4 + 1] = rgb[1];
      px[px4 + 2] = rgb[2];
      px[px4 + 3] = Math.round(bgA * 255);
    }
  }
  return px;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function toPng(size, pixels) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(join(OUT, `icon-${size}.png`), toPng(size, render(size)));
  console.log(`icon-${size}.png`);
}
