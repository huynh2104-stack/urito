import type { BusinessType, CurrencyCode, TaxCategory } from '../types';

export interface MarketProductSpec {
  name: string;
  kana?: string;
  price: number;
  cost: number;
  cat: number;
  unit?: string;
  stock?: number;
  minStock?: number;
  mods?: number[];
  fav?: boolean;
  taxCategory?: TaxCategory;
  barcode?: string;
  /** public 配下からの相対パス（例: ./samples/ja/r01-mineral-water.webp） */
  image?: string;
}

export interface MarketModifierSpec {
  name: string;
  multiple: boolean;
  required: boolean;
  options: { name: string; delta: number }[];
}

export interface MarketSeedSet {
  baseCurrency: CurrencyCode;
  eatInRule?: boolean;
  categories: string[];
  modifiers: MarketModifierSpec[];
  products: MarketProductSpec[];
  areas: string[];
  tablesPerArea: number[];
}

export type MarketCatalog = Record<BusinessType, MarketSeedSet>;

/** 各市場の基準通貨で記述された金額を通貨単位に応じて換算する。同一通貨なら無加工で返す。 */
export function scaleCurrency(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return amount;
  const vnd = from === 'VND' ? amount : from === 'JPY' ? amount * 170 : amount * 25;
  if (to === 'VND') return Math.round(vnd / 1000) * 1000;
  if (to === 'JPY') return Math.max(1, Math.round(vnd / 170 / 10) * 10);
  return Math.max(1, Math.round(vnd / 25)); // USD セント単位
}
