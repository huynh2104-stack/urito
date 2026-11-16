/** E-03: 静的LP (dist-site/) と POS本体 (dist/) を結合し、デプロイ可能な dist-showcase/ を生成する。 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SITE_DIST = join(ROOT, 'dist-site');
const APP_DIST = join(ROOT, 'dist');
const SHOWCASE_DIST = join(ROOT, 'dist-showcase');

if (!existsSync(SITE_DIST)) {
  throw new Error('dist-site/ が見つかりません。先に npm run build:site を実行してください。');
}
if (!existsSync(APP_DIST)) {
  throw new Error('dist/ が見つかりません。先に npm run build を実行してください。');
}

// 静的サイト側に必要な LP 用画像3点とアプリアイコンのみをコピーする
const lpSamples = ['lp-01-shop-counter.webp', 'lp-02-cafe-counter.webp', 'lp-03-phone-in-shop.webp'];
for (const dst of [SITE_DIST]) {
  mkdirSync(join(dst, 'samples', 'ja'), { recursive: true });
  for (const name of lpSamples) {
    const src = join(ROOT, 'public', 'samples', 'ja', name);
    if (existsSync(src)) cpSync(src, join(dst, 'samples', 'ja', name));
  }
  const iconsSrc = join(ROOT, 'public', 'icons');
  if (existsSync(iconsSrc)) {
    cpSync(iconsSrc, join(dst, 'icons'), { recursive: true });
  }
  const shotsSrc = join(ROOT, 'site', 'screenshots');
  if (existsSync(shotsSrc)) {
    cpSync(shotsSrc, join(dst, 'screenshots'), { recursive: true });
  }
  const ogpSrc = join(ROOT, 'site', 'ogp.png');
  if (existsSync(ogpSrc)) {
    cpSync(ogpSrc, join(dst, 'ogp.png'));
  }
}

rmSync(SHOWCASE_DIST, { recursive: true, force: true });
cpSync(SITE_DIST, SHOWCASE_DIST, { recursive: true });
cpSync(APP_DIST, join(SHOWCASE_DIST, 'app'), { recursive: true });

console.log('Assembled dist-showcase/ (LP + /app POS PWA)');
