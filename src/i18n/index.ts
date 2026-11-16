import type { Lang } from '@/db/types';
import type { Dictionary, TranslationKey } from './vi';
import { ja } from './ja';

export type { TranslationKey, Dictionary };

/** C-05/C-08: 初期ロードJS削減のため既定言語(ja)のみ同梱し、vi/en辞書は必要時に遅延読込する。 */
export const DICTIONARIES: Partial<Record<Lang, Dictionary>> & { ja: Dictionary } = { ja };

export async function ensureLangDict(lang: Lang): Promise<void> {
  if (DICTIONARIES[lang]) return;
  if (lang === 'vi') {
    const { vi } = await import('./vi');
    DICTIONARIES.vi = vi;
  } else if (lang === 'en') {
    const { en } = await import('./en');
    DICTIONARIES.en = en;
  }
}

export const LANGUAGES: { code: Lang; label: string; short: string }[] = [
  { code: 'vi', label: 'Tiếng Việt', short: 'VI' },
  { code: 'ja', label: '日本語', short: 'JA' },
  { code: 'en', label: 'English', short: 'EN' },
];

export type TVars = Record<string, string | number>;

/** 指定言語の辞書から翻訳文字列を取得し、未読込時はベース辞書へフォールバックする。 */
export function translate(lang: Lang, key: TranslationKey, vars?: TVars): string {
  const dict = DICTIONARIES[lang] ?? DICTIONARIES.ja;
  let out: string = dict[key] ?? DICTIONARIES.ja[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}

export type TFunc = (key: TranslationKey, vars?: TVars) => string;

export function makeT(lang: Lang): TFunc {
  return (key, vars) => translate(lang, key, vars);
}

/** ビルドモードおよびブラウザ言語から初期言語を判定する（shop ビルドではベトナム語を既定とする）。 */
export function detectLang(): Lang {
  if (import.meta.env.MODE === 'shop') return 'vi';
  const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'ja';
  if (nav.startsWith('vi')) return 'vi';
  return 'ja';
}
