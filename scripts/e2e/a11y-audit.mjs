/**
 * E-07: 主要 6 画面 × 2 画面幅 (360px / 1440px) × Light / Dark モードの
 * axe-core アクセシビリティ監査および <dialog> キーボード操作・横スクロール溢れ検証。
 */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';
import { findChromePath, serveStaticDir } from '../_chrome.mjs';

const DIST = join(process.cwd(), 'dist');
const ROUTES = ['#/pos', '#/orders', '#/products', '#/inventory', '#/reports', '#/settings'];
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 360, height: 800 },
];

async function main() {
  const srv = await serveStaticDir(DIST);
  const browser = await chromium.launch({ executablePath: findChromePath(), headless: true });

  try {
    let totalSerious = 0;
    for (const theme of ['light', 'dark']) {
      for (const vp of VIEWPORTS) {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const page = await context.newPage();

        // テーマを設定するため ?demo=1 で開く
        await page.goto(`${srv.url}/?demo=1#/pos`, { waitUntil: 'networkidle' });
        await page.waitForSelector('.prod-tile, .prod-tag', { timeout: 15000 });
        if (theme === 'dark') {
          await page.evaluate(() => {
            document.documentElement.dataset.theme = 'dark';
          });
        }

        for (const hash of ROUTES) {
          await page.evaluate((h) => {
            window.location.hash = h;
          }, hash);
          // React.lazy チャンク読込と 0.22s のフェードイン完了後に監査を実行する
          await page.waitForFunction(
            () => {
              const p = document.querySelector('.main-area .page, .pos');
              return Boolean(p && getComputedStyle(p).opacity === '1');
            },
            { timeout: 10000 },
          );
          await page.waitForTimeout(100);

          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
          );
          assert.equal(overflow, false, `横溢れ検出: ${theme} ${vp.name} ${hash}`);

          const results = await new AxeBuilder({ page })
            .disableRules(['color-contrast-enhanced'])
            .analyze();

          const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
          if (bad.length > 0) {
            console.error(`NG [${theme} ${vp.name} ${hash}]:`, JSON.stringify(bad, null, 2));
            totalSerious += bad.length;
          } else {
            console.log(`✓ ${theme.padEnd(5)} ${vp.name.padEnd(7)} ${hash.padEnd(12)} (violations critical/serious = 0)`);
          }
        }

        // ネイティブ <dialog> の Esc キー閉じ＆トリガー要素へのフォーカス復帰を検証（desktop POS）
        if (theme === 'light' && vp.name === 'desktop') {
          await page.evaluate(() => {
            window.location.hash = '#/pos';
          });
          await page.waitForTimeout(300);
          const scanBtn = page.locator('.scan-btn');
          await scanBtn.focus();
          await scanBtn.click();
          await page.waitForSelector('dialog.modal[open]', { timeout: 5000 });
          await page.keyboard.press('Escape');
          await page.waitForSelector('dialog.modal[open]', { state: 'detached', timeout: 5000 });
          const activeClass = await page.evaluate(() => document.activeElement?.className ?? '');
          assert.ok(activeClass.includes('scan-btn'), `Esc 閉じ後のフォーカス復帰失敗: active="${activeClass}"`);
          console.log('✓ <dialog> showModal / Escape / フォーカス復帰 正常');
        }

        await context.close();
      }
    }

    assert.equal(totalSerious, 0, `重大な a11y 違反が ${totalSerious} 件残存しています`);
    console.log('E-07 全画面・全モード a11y 監査合格 (0 violations)');
  } finally {
    await browser.close();
    await srv.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
