/**
 * E-03 / E-04: 固定時計・決定論的シードを用いて LP と README 用の実画面スクリーンショット＋OGP画像を生成する。
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { findChromePath, serveStaticDir } from './_chrome.mjs';

const DIST = join(process.cwd(), 'dist');
const OUT_DIRS = [join(process.cwd(), 'docs', 'screenshots'), join(process.cwd(), 'site', 'screenshots')];
const FIXED_TIME = new Date('2026-11-15T14:25:00+09:00').valueOf();

async function freezeClock(context) {
  await context.addInitScript((fixed) => {
    const OrigDate = Date;
    class FixedDate extends OrigDate {
      constructor(...args) {
        if (args.length === 0) super(fixed);
        else super(...args);
      }
      static now() {
        return fixed;
      }
    }
    window.Date = FixedDate;
  }, FIXED_TIME);
}

async function saveShot(page, name, clip) {
  for (const dir of OUT_DIRS) {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, name), clip });
  }
  console.log(`✓ saved ${name}`);
}

async function main() {
  const srv = await serveStaticDir(DIST);
  const browser = await chromium.launch({ executablePath: findChromePath(), headless: true });

  try {
    // 1. デスクトップ POS（ライト・商品写真＋カート3点入り）
    const deskCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    await freezeClock(deskCtx);
    const desk = await deskCtx.newPage();
    await desk.goto(`${srv.url}/?demo=1#/pos`, { waitUntil: 'networkidle' });
    await desk.waitForSelector('.prod-tile, .prod-tag', { timeout: 15000 });
    await desk.waitForTimeout(300);

    const tiles = desk.locator('.prod-tile, .prod-tag');
    await tiles.nth(0).click();
    await tiles.nth(1).click();
    await tiles.nth(2).click();
    await desk.waitForTimeout(350);
    await saveShot(desk, 'pos-desktop.png');

    // 2. デスクトップ レシートプレビュー（インボイス対応 80mm）
    await desk.evaluate(() => {
      window.location.hash = '#/settings';
    });
    await desk.waitForSelector('.tabs', { timeout: 10000 });
    await desk.locator('.tabs button').nth(2).click();
    await desk.waitForTimeout(250);
    await desk.getByRole('button', { name: /レシートプレビュー|プレビュー/ }).click();
    await desk.waitForSelector('dialog.modal[open] .receipt', { timeout: 8000 });
    await desk.waitForTimeout(250);
    const receiptBox = await desk.locator('dialog.modal[open] .receipt-preview').boundingBox();
    if (receiptBox) {
      await saveShot(desk, 'receipt-sample.png', {
        x: Math.max(0, receiptBox.x - 8),
        y: Math.max(0, receiptBox.y - 8),
        width: receiptBox.width + 16,
        height: receiptBox.height + 16,
      });
    }
    await desk.keyboard.press('Escape');
    await desk.waitForTimeout(200);

    // 3. デスクトップ レポート画面（日次集計チャート＋チャネル別売上）
    await desk.evaluate(() => {
      window.location.hash = '#/reports';
    });
    await desk.waitForSelector('.page .stat-value', { timeout: 10000 });
    await desk.locator('.page select').first().selectOption('last_30');
    await desk.waitForTimeout(450);
    await saveShot(desk, 'reports-desktop.png');

    // 4. デスクトップ 在庫管理画面
    await desk.evaluate(() => {
      window.location.hash = '#/inventory';
    });
    await desk.waitForSelector('.table', { timeout: 10000 });
    await desk.waitForTimeout(350);
    await saveShot(desk, 'inventory-desktop.png');

    // 5. デスクトップ ダークモード POS
    await desk.evaluate(() => {
      window.location.hash = '#/pos';
      document.documentElement.dataset.theme = 'dark';
    });
    await desk.waitForSelector('.prod-tile, .prod-tag', { timeout: 10000 });
    await desk.waitForTimeout(350);
    await saveShot(desk, 'pos-dark.png');
    await deskCtx.close();

    // 6. モバイル POS (390x844)
    const mobCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    });
    await freezeClock(mobCtx);
    const mob = await mobCtx.newPage();
    await mob.goto(`${srv.url}/?demo=1#/pos`, { waitUntil: 'networkidle' });
    await mob.waitForSelector('.prod-tile, .prod-tag', { timeout: 15000 });
    await mob.locator('.prod-tile, .prod-tag').first().click();
    await mob.waitForTimeout(350);
    await saveShot(mob, 'pos-mobile.png');
    await mobCtx.close();

    // 7. 1200x630 OGP 画像生成
    const ogCtx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    const og = await ogCtx.newPage();
    await og.setContent(
      `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{width:1200px;height:630px;display:grid;grid-template-columns:1.05fr 1fr;gap:36px;padding:56px;
          background:linear-gradient(135deg,#0d153a 0%,#1d3a8a 60%,#2947d4 100%);
          color:#fff;font-family:"Segoe UI","Yu Gothic UI","Hiragino Sans",Meiryo,sans-serif;align-items:center}
        .brand{display:flex;align-items:center;gap:16px;margin-bottom:24px}
        .brand span{font-size:34px;font-weight:700;letter-spacing:-0.02em}
        h1{font-size:48px;line-height:1.18;font-weight:700;margin-bottom:20px;letter-spacing:-0.02em}
        h1 em{font-style:normal;color:#ffce3a}
        p{font-size:21px;line-height:1.6;color:rgba(232,238,255,0.88)}
        .badges{display:flex;gap:10px;margin-top:26px;flex-wrap:wrap}
        .badges span{background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.22);
          padding:8px 14px;border-radius:999px;font-size:15px;font-weight:600}
        .frame{border-radius:16px;overflow:hidden;box-shadow:0 28px 60px rgba(4,9,30,0.5);border:2px solid rgba(255,255,255,0.2)}
        .frame img{display:block;width:100%;height:auto}
      </style></head><body>
        <div>
          <div class="brand">
            <svg width="56" height="56" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#2947d4"/><path d="M19 15v20c0 7.5 5.7 12.5 13 12.5S45 42.5 45 35V15" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round"/><rect x="21" y="50" width="22" height="4.5" rx="2.25" fill="#ffce3a"/></svg>
            <span>Urito POS</span>
          </div>
          <h1><em>レジはシンプル。</em><br>帳簿ははっきり。</h1>
          <p>月額費用0円・完全オフライン動作。<br>小規模店舗のためのブラウザ型 POS システム</p>
          <div class="badges"><span>MIT Open Source</span><span>インボイス/軽減税率</span><span>IndexedDB + SW</span></div>
        </div>
        <div class="frame"><img src="${srv.url.replace(/:\d+$/, '')}:_PLACEHOLDER_"/></div>
      </body></html>`.replace(
        '<img src="' + srv.url.replace(/:\d+$/, '') + ':_PLACEHOLDER_"/>',
        `<img src="data:image/png;base64,${(await import('node:fs')).readFileSync(join(OUT_DIRS[1], 'pos-desktop.png')).toString('base64')}"/>`,
      ),
      { waitUntil: 'load' },
    );
    mkdirSync(join(process.cwd(), 'site', 'public'), { recursive: true });
    await og.screenshot({ path: join(process.cwd(), 'site', 'ogp.png') });
    await og.screenshot({ path: join(process.cwd(), 'docs', 'screenshots', 'ogp.png') });
    console.log('✓ saved ogp.png (1200x630)');
    await ogCtx.close();
  } finally {
    await browser.close();
    await srv.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
