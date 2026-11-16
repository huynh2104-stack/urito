#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import sharp from 'sharp';

const SRC_DIR = 'assets-src/samples/ja';
const OUT_DIR = 'public/samples/ja';
const RETAIL_BUDGET_BYTES = 600 * 1024;

const REQUIRED_RETAIL_PREFIXES = Array.from({ length: 30 }, (_, i) => `r${String(i + 1).padStart(2, '0')}-`);

if (!existsSync(SRC_DIR)) {
  console.error(`ソースディレクトリが見つかりません: ${SRC_DIR}`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const files = readdirSync(SRC_DIR)
  .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
  .sort();

const missingRetail = REQUIRED_RETAIL_PREFIXES.filter((pre) => !files.some((f) => f.startsWith(pre)));
if (missingRetail.length) {
  console.error('必須の小売サンプル画像が不足しています:', missingRetail.join(', '));
  process.exit(1);
}

const rows = [];
let retailBytes = 0;

for (const file of files) {
  const srcPath = join(SRC_DIR, file);
  const stem = basename(file).replace(/\.(png|jpe?g|webp)$/i, '');
  const outPath = join(OUT_DIR, `${stem}.webp`);

  const img = sharp(srcPath);
  const meta = await img.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) {
    console.error(`画像サイズを取得できません: ${file}`);
    process.exit(1);
  }

  const isLp = stem.startsWith('lp-');
  const ratio = w / h;

  if (isLp) {
    if (ratio < 1.2 || ratio > 1.8) {
      console.error(`LP画像の横長比率が想定外です (${w}x${h}): ${file}`);
      process.exit(1);
    }
    await img.resize({ width: 960 }).webp({ quality: 80 }).toFile(outPath);
  } else {
    if (Math.abs(w - h) / Math.max(w, h) > 0.02) {
      console.error(`商品画像が正方形 (1:1) ではありません (${w}x${h}): ${file}`);
      process.exit(1);
    }
    await img.resize(320, 320, { fit: 'cover' }).webp({ quality: 78 }).toFile(outPath);
  }

  const size = statSync(outPath).size;
  if (/^r\d{2}-/.test(stem)) retailBytes += size;
  rows.push({
    file: `${stem}.webp`,
    src: `${w}x${h}`,
    kb: (size / 1024).toFixed(2),
  });
}

console.log('File                             Source       WebP (KB)');
console.log('-------------------------------------------------------');
for (const r of rows) {
  console.log(`${r.file.padEnd(32)} ${r.src.padEnd(12)} ${r.kb.padStart(8)}`);
}
console.log('-------------------------------------------------------');
console.log(
  `小売30枚合計: ${(retailBytes / 1024).toFixed(2)} KB / 上限 ${(RETAIL_BUDGET_BYTES / 1024).toFixed(0)} KB`,
);

if (retailBytes > RETAIL_BUDGET_BYTES) {
  console.error('小売30枚の WebP 合計サイズが上限 600 KB を超過しました。');
  process.exit(1);
}
