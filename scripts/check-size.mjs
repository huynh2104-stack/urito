/** ビルド成果物のサイズ（初期ロードJS・遅延JS・CSS・フォント）を集計し、perf-budget.json の上限を検証する。 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = process.cwd();
const DIST_DIR = join(ROOT, 'dist');
const ASSETS_DIR = join(DIST_DIR, 'assets');
const budget = JSON.parse(readFileSync(join(ROOT, 'perf-budget.json'), 'utf8'));

// dist/index.html の <script src> と <link rel="modulepreload" href> から初期ロード対象チャンクを抽出する
const indexHtml = readFileSync(join(DIST_DIR, 'index.html'), 'utf8');
const initialJsNames = new Set();
for (const m of indexHtml.matchAll(/(?:src|href)=["']\.?\/assets\/([^"']+\.js)["']/g)) {
  initialJsNames.add(m[1]);
}

const files = readdirSync(ASSETS_DIR).sort();
let initialJsGzipTotal = 0;
let allJsGzipTotal = 0;
let cssGzipTotal = 0;
let fontRawTotal = 0;

console.log('File                                                    Raw (KB)   Gzip (KB)');
console.log('----------------------------------------------------------------------------');

for (const name of files) {
  const buf = readFileSync(join(ASSETS_DIR, name));
  const ext = extname(name).toLowerCase();
  const rawKb = (buf.length / 1024).toFixed(2);

  if (ext === '.js') {
    const gz = gzipSync(buf, { level: 9 }).length;
    allJsGzipTotal += gz;
    const isInitial = initialJsNames.has(name);
    if (isInitial) initialJsGzipTotal += gz;
    const tag = isInitial ? ' [init]' : ' [lazy]';
    console.log(`${(name + tag).padEnd(55)} ${rawKb.padStart(8)}   ${(gz / 1024).toFixed(2).padStart(9)}`);
  } else if (ext === '.css') {
    const gz = gzipSync(buf, { level: 9 }).length;
    cssGzipTotal += gz;
    console.log(`${name.padEnd(55)} ${rawKb.padStart(8)}   ${(gz / 1024).toFixed(2).padStart(9)}`);
  } else if (ext === '.woff' || ext === '.woff2') {
    fontRawTotal += buf.length;
    console.log(`${name.padEnd(55)} ${rawKb.padStart(8)}           -`);
  }
}

console.log('----------------------------------------------------------------------------');
console.log(
  `初期JS gzip  : ${(initialJsGzipTotal / 1024).toFixed(2)} KB / 上限 ${(budget.maxInitialJsGzipBytes / 1024).toFixed(2)} KB (全体JS gzip ${(allJsGzipTotal / 1024).toFixed(2)} KB)`,
);
console.log(`CSS gzip合計 : ${(cssGzipTotal / 1024).toFixed(2)} KB / 上限 ${(budget.maxCssGzipBytes / 1024).toFixed(2)} KB`);
console.log(`Font合計     : ${(fontRawTotal / 1024).toFixed(2)} KB / 上限 ${(budget.maxFontBytes / 1024).toFixed(2)} KB`);

let failed = false;
if (initialJsNames.size === 0) {
  console.error('エラー: dist/index.html から初期JSチャンクを検出できませんでした');
  failed = true;
}
if (initialJsGzipTotal > budget.maxInitialJsGzipBytes) {
  console.error(`エラー: 初期JS gzip合計 (${initialJsGzipTotal} B) が予算 (${budget.maxInitialJsGzipBytes} B) を超過しています`);
  failed = true;
}
if (cssGzipTotal > budget.maxCssGzipBytes) {
  console.error(`エラー: CSS gzip合計 (${cssGzipTotal} B) が予算 (${budget.maxCssGzipBytes} B) を超過しています`);
  failed = true;
}
if (fontRawTotal > budget.maxFontBytes) {
  console.error(`エラー: Font合計 (${fontRawTotal} B) が予算 (${budget.maxFontBytes} B) を超過しています`);
  failed = true;
}

if (failed) process.exit(1);
