import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'node:path';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

/** Vite の静的アセット解析によるディレクトリ解決・重複HTML生成を避けつつ hreflang を挿入する。 */
function hreflangPlugin(): Plugin {
  return {
    name: 'urito-hreflang',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const clean = ctx.filename.replace(/\\/g, '/');
        const isRoot = !clean.includes('/site/en/') && !clean.includes('/site/vi/');
        const jaHref = isRoot ? './' : '../';
        const enHref = isRoot ? './en/' : '../en/';
        const viHref = isRoot ? './vi/' : '../vi/';
        return [
          { tag: 'link', attrs: { rel: 'alternate', hreflang: 'ja', href: jaHref }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'alternate', hreflang: 'en', href: enHref }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'alternate', hreflang: 'vi', href: viHref }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'alternate', hreflang: 'x-default', href: jaHref }, injectTo: 'head' },
        ];
      },
    },
  };
}

/** E-03: 静的ランディングページ（多言語3ページ）のみを出力する独立 Vite 設定。 */
export default defineConfig({
  root: resolve(rootDir, 'site'),
  base: './',
  publicDir: false,
  plugins: [hreflangPlugin()],
  build: {
    outDir: resolve(rootDir, 'dist-site'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        ja: resolve(rootDir, 'site/index.html'),
        en: resolve(rootDir, 'site/en/index.html'),
        vi: resolve(rootDir, 'site/vi/index.html'),
      },
    },
  },
});
