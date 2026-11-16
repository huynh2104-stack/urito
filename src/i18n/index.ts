import type { Lang } from '@/db/types';
import { vi, type Dictionary, type TranslationKey } from './vi';
import { ja } from './ja';
import { en } from './en';

export type { TranslationKey, Dictionary };

export const DICTIONARIES: Record<Lang, Dictionary> = { vi, ja, en };

export const LANGUAGES: { code: Lang; label: string; short: string }[] = [
  { code: 'vi', label: 'Tiếng Việt', short: 'VI' },
  { code: 'ja', label: '日本語', short: 'JA' },
  { code: 'en', label: 'English', short: 'EN' },
];

export type TVars = Record<string, string | number>;

/** `t('pos.stockLeft', { n: 3 })` -> "Còn 3". Unknown keys fall back to the key
 *  itself so a missing string is visible instead of silently blank. */
export function translate(lang: Lang, key: TranslationKey, vars?: TVars): string {
  const dict = DICTIONARIES[lang] ?? vi;
  let out: string = dict[key] ?? vi[key] ?? key;
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

/** Best-effort guess from the browser, used only before onboarding. */
export function detectLang(): Lang {
  const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'ja';
  if (nav.startsWith('vi')) return 'vi';
  return 'ja';
}
