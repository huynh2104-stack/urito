import type { Lang } from '@/db/types';

let loadedVi = false;

/** C-08: ベトナム語利用時のみ WebFont（400/600/700）を動的読込し、日本語・英語ではシステムフォントで初期負荷をゼロにする。 */
export function ensureFontsForLang(lang: Lang): void {
  if (lang !== 'vi' || loadedVi || typeof document === 'undefined') return;
  loadedVi = true;
  void Promise.all([
    import('@fontsource/be-vietnam-pro/vietnamese-400.css'),
    import('@fontsource/be-vietnam-pro/vietnamese-600.css'),
    import('@fontsource/be-vietnam-pro/vietnamese-700.css'),
    import('@fontsource/be-vietnam-pro/latin-400.css'),
    import('@fontsource/be-vietnam-pro/latin-600.css'),
    import('@fontsource/be-vietnam-pro/latin-700.css'),
  ]).catch(() => {
    loadedVi = false;
  });
}
