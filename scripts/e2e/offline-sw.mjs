/**
 * B-07: Service Worker の初回プリキャッシュ・完全オフライン再読込＆会計・更新検知UIの E2E 検証。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { findChromePath, serveStaticDir } from '../_chrome.mjs';

const DIST = join(process.cwd(), 'dist');

async function main() {
  let serveNewSw = false;
  const origSw = readFileSync(join(DIST, 'sw.js'), 'utf8');
  const updatedSw = origSw.replace(/const CACHE = '([^']+)'/, "const CACHE = '$1-next'");

  const srv = await serveStaticDir(DIST, {
    overrideHandler: (pathname, _req, res) => {
      if (pathname === '/sw.js') {
        res.writeHead(200, {
          'Content-Type': 'text/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(serveNewSw ? updatedSw : origSw);
        return true;
      }
      return false;
    },
  });

  const browser = await chromium.launch({
    executablePath: findChromePath(),
    headless: true,
  });

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    // 1. 初回訪問で Service Worker が登録・制御開始し、POS 画面が表示されることを検証
    await page.goto(`${srv.url}/?demo=1#/pos`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.pos-tile, .prod-tile, .prod-tag', { timeout: 15000 });
    await page.waitForFunction(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.ready;
      return Boolean(reg.active && navigator.serviceWorker.controller);
    });
    console.log('✓ 1. Service Worker 初回プリキャッシュ・制御確立');

    // 2. 完全オフラインにして再読込し、POS 画面で 1 件販売完了できることを検証
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.prod-tile, .prod-tag', { timeout: 15000 });
    await page.locator('.prod-tile, .prod-tag').first().click();
    await page.waitForSelector('.cart-line', { timeout: 5000 });
    await page.locator('.checkout-btn').click();
    await page.waitForSelector('dialog.modal[open]', { timeout: 5000 });
    await page.locator('dialog.modal[open] .modal-foot .btn-primary').click();
    await page.waitForSelector('dialog.modal[open] .stamp', { timeout: 8000 });
    await page.locator('dialog.modal[open] .modal-foot .btn-primary').click();
    console.log('✓ 2. オフライン再読込後のPOS画面表示・販売確定成功');

    // 3. オンライン復帰後、カートに未会計商品がある状態で SW 更新を検知し確認ダイアログ経由で更新できることを検証
    await context.setOffline(false);
    await page.locator('.prod-tile, .prod-tag').first().click();
    await page.waitForSelector('.cart-line', { timeout: 5000 });

    serveNewSw = true;
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
    });

    const updateBtn = page.getByRole('button', { name: '新しいバージョンがあります' });
    await updateBtn.waitFor({ state: 'visible', timeout: 10000 });
    await updateBtn.click();

    // 未会計カートがあるため確認モーダルが出る
    await page.waitForSelector('dialog.modal[open]', { timeout: 5000 });
    const [reloaded] = await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }),
      page.locator('dialog.modal[open] .modal-foot .btn-primary').click(),
    ]);
    assert.ok(reloaded, 'SKIP_WAITING 後に自動リロードされること');
    await page.waitForSelector('.prod-tile, .prod-tag', { timeout: 15000 });
    const cacheName = await page.evaluate(async () => {
      const keys = await caches.keys();
      return keys;
    });
    assert.ok(cacheName.some((k) => k.endsWith('-next')), `新キャッシュ有効化確認: ${cacheName.join(',')}`);
    console.log('✓ 3. SW新バージョン検知 → 未会計確認モーダル → SKIP_WAITING リロード検証完了');
  } finally {
    await browser.close();
    await srv.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
