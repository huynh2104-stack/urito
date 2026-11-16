import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import type { Plugin } from 'vite';

/** E-06: 実店舗向け Netlify ビルド（--mode shop）時に HTML・マニフェストをベトナム語表記へ切り替える。 */
function uritoShopVariant(isShop: boolean): Plugin {
  return {
    name: 'urito-shop-variant',
    apply: 'build',
    transformIndexHtml(html) {
      if (!isShop) return html;
      return html
        .replace('<html lang="ja"', '<html lang="vi"')
        .replace(
          'content="Urito - オフライン対応POSレジ・会計・レシート・売上レポート"',
          'content="Urito - Phần mềm bán hàng, thu ngân, in hoá đơn và báo cáo doanh thu ngoại tuyến"',
        )
        .replace('<title>Urito</title>', '<title>Urito POS — Phần mềm bán hàng</title>');
    },
    writeBundle(options) {
      if (!isShop) return;
      const root = fileURLToPath(new URL('.', import.meta.url));
      const baseManifest = JSON.parse(
        readFileSync(join(root, 'public', 'manifest.webmanifest'), 'utf8'),
      ) as Record<string, unknown>;
      const shopManifest = {
        ...baseManifest,
        name: 'Urito POS — Bán hàng',
        short_name: 'Urito',
        description: 'Phần mềm bán hàng, thu ngân, in hoá đơn và quản lý tồn kho ngoại tuyến',
        lang: 'vi',
      };
      const outDir = options.dir ?? join(root, 'dist');
      writeFileSync(join(outDir, 'manifest.webmanifest'), `${JSON.stringify(shopManifest, null, 2)}\n`, 'utf8');
    },
  };
}

/** B-07: 本番ビルド時のアセット一覧をハッシュ付きで埋め込んだ sw.js を生成する（実ファイル存在確認済みのアセットのみ登録）。 */
function uritoServiceWorker(): Plugin {
  return {
    name: 'urito-sw',
    apply: 'build',
    writeBundle(options, bundle) {
      const root = fileURLToPath(new URL('.', import.meta.url));
      const outDir = options.dir ?? join(root, 'dist');
      const iconsDir = join(root, 'public', 'icons');
      const staticEntries = ['./', './index.html', './manifest.webmanifest'];
      if (existsSync(iconsDir)) {
        for (const f of readdirSync(iconsDir).sort()) {
          staticEntries.push(`./icons/${f}`);
        }
      }

      const assetEntries: string[] = [];
      const hash = createHash('sha256');
      for (const key of Object.keys(bundle).sort()) {
        if (key.startsWith('samples/')) continue;
        const item = bundle[key];
        hash.update(key);
        if (item.type === 'chunk') hash.update(item.code);
        else hash.update(item.source);
        if (!/^assets\/.*\.(js|css|woff2)$/.test(key)) continue;
        if (!existsSync(join(outDir, key))) continue;
        assetEntries.push(`./${key}`);
      }

      const precache = [...new Set([...staticEntries, ...assetEntries])];
      const version = `urito-${hash.digest('hex').slice(0, 12)}`;
      const tplPath = join(root, 'src', 'sw', 'sw.template.js');
      const tpl = readFileSync(tplPath, 'utf8');
      const source = tpl
        .replace('__URITO_CACHE__', version)
        .replace('/*__URITO_PRECACHE__*/ []', JSON.stringify(precache, null, 2));

      writeFileSync(join(outDir, 'sw.js'), source, 'utf8');
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), uritoShopVariant(mode === 'shop'), uritoServiceWorker()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/scheduler/')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/dexie/')) {
            return 'vendor-dexie';
          }
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
