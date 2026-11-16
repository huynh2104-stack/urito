import type { CurrencyCode, Lang } from '@/db/types';

export interface CurrencyDef {
  code: CurrencyCode;
  symbol: string;
  decimals: number;
  prefix: boolean;
  /** 会計画面で表示するクイック現金ボタン金額（最小単位）。 */
  quickCash: number[];
  /** 合計金額のデフォルト端数処理単位（最小単位）。 */
  defaultRoundTo: number;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyDef> = {
  VND: {
    code: 'VND',
    symbol: '₫',
    decimals: 0,
    prefix: false,
    quickCash: [10000, 20000, 50000, 100000, 200000, 500000],
    defaultRoundTo: 1000,
  },
  JPY: {
    code: 'JPY',
    symbol: '¥',
    decimals: 0,
    prefix: true,
    quickCash: [100, 500, 1000, 2000, 5000, 10000],
    defaultRoundTo: 1,
  },
  USD: {
    code: 'USD',
    symbol: '$',
    decimals: 2,
    prefix: true,
    quickCash: [100, 500, 1000, 2000, 5000, 10000],
    defaultRoundTo: 1,
  },
};

const LOCALE_TAG: Record<Lang, string> = { vi: 'vi-VN', ja: 'ja-JP', en: 'en-US' };

export function localeTag(lang: Lang): string {
  return LOCALE_TAG[lang] ?? 'en-US';
}

/** 整数金額に対するパーセンテージを四捨五入して最小単位で返す。 */
export function percentOf(amount: number, percent: number): number {
  if (!percent) return 0;
  return Math.round((amount * percent) / 100);
}

/** 合計金額を指定単位へ端数丸めする。 */
export function roundToStep(amount: number, step: number): number {
  if (!step || step <= 1) return Math.round(amount);
  return Math.round(amount / step) * step;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** 最小単位の整数金額を表示文字列（例: ¥1,200 / 1.250.000 ₫）へ整形する。 */
export function formatMoney(minor: number, currency: CurrencyCode, lang: Lang): string {
  const def = CURRENCIES[currency];
  const value = minor / 10 ** def.decimals;
  const body = new Intl.NumberFormat(localeTag(lang), {
    minimumFractionDigits: def.decimals,
    maximumFractionDigits: def.decimals,
  }).format(value);
  return def.prefix ? `${def.symbol}${body}` : `${body} ${def.symbol}`;
}

/** Money without the currency symbol - used inside inputs and receipts. */
export function formatAmount(minor: number, currency: CurrencyCode, lang: Lang): string {
  const def = CURRENCIES[currency];
  return new Intl.NumberFormat(localeTag(lang), {
    minimumFractionDigits: def.decimals,
    maximumFractionDigits: def.decimals,
  }).format(minor / 10 ** def.decimals);
}

/** Parse whatever the user typed ("1.250.000", "1,250,000", "12,5") into minor units. */
export function parseMoney(input: string, currency: CurrencyCode): number {
  const def = CURRENCIES[currency];
  const raw = String(input).replace(/[^\d.,-]/g, '').trim();
  if (!raw) return 0;
  if (def.decimals === 0) {
    const digits = raw.replace(/[^\d-]/g, '');
    const n = Number(digits);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }
  // Treat the last separator as the decimal point when it leaves <= 2 trailing digits.
  const lastDot = raw.lastIndexOf('.');
  const lastComma = raw.lastIndexOf(',');
  const sepIndex = Math.max(lastDot, lastComma);
  let normalised: string;
  if (sepIndex >= 0 && raw.length - sepIndex - 1 <= def.decimals) {
    normalised = raw.slice(0, sepIndex).replace(/[^\d-]/g, '') + '.' + raw.slice(sepIndex + 1).replace(/\D/g, '');
  } else {
    normalised = raw.replace(/[^\d-]/g, '');
  }
  const n = Number(normalised);
  return Number.isFinite(n) ? Math.round(n * 10 ** def.decimals) : 0;
}

/** Quantities allow up to 3 decimals so shops can sell 0.35 kg. */
export function normaliseQty(qty: number): number {
  return Math.round(qty * 1000) / 1000;
}

export function formatQty(qty: number, lang: Lang): string {
  return new Intl.NumberFormat(localeTag(lang), { maximumFractionDigits: 3 }).format(qty);
}

export function formatNumber(n: number, lang: Lang, decimals = 0): string {
  return new Intl.NumberFormat(localeTag(lang), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function formatPercent(n: number, lang: Lang): string {
  return `${new Intl.NumberFormat(localeTag(lang), { maximumFractionDigits: 1 }).format(n)}%`;
}

/**
 * F-02: 主通貨の最小単位金額を手動設定為替レート（1主通貨 = rate外貨）で目標通貨の最小単位へ換算する。
 */
export function convertByRate(amountMinor: number, from: CurrencyCode, to: CurrencyCode, rate: number): number {
  if (!Number.isFinite(amountMinor) || !Number.isFinite(rate) || rate <= 0) return 0;
  const fromMajor = amountMinor / 10 ** CURRENCIES[from].decimals;
  return Math.max(0, Math.round(fromMajor * rate * 10 ** CURRENCIES[to].decimals));
}
