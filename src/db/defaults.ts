import { CURRENCIES } from '@/core/money';
import { newId } from '@/core/id';
import type { BusinessType, CurrencyCode, Lang, Settings, User } from './types';

export const PALETTE = [
  '#0ea5e9', '#f97316', '#22c55e', '#a855f7', '#ef4444',
  '#14b8a6', '#eab308', '#ec4899', '#6366f1', '#84cc16',
];

export function pickColor(seed: number): string {
  return PALETTE[Math.abs(seed) % PALETTE.length];
}

export interface DocPrefixes {
  order: Record<BusinessType, string>;
  shift: string;
  purchase: string;
  customer: string;
  sku: string;
}

/** D-03: 言語・地域に応じた既定の伝票・コード接頭辞を返す（vi は既存互換の接頭辞を維持）。 */
export function docPrefixes(lang: Lang): DocPrefixes {
  if (lang === 'vi') {
    return {
      order: { retail: 'HD', cafe: 'CF', restaurant: 'NH' },
      shift: 'CA',
      purchase: 'PN',
      customer: 'KH',
      sku: 'SP',
    };
  }
  return {
    order: { retail: 'ORD', cafe: 'ORD', restaurant: 'TBL' },
    shift: 'SHF',
    purchase: 'PO',
    customer: 'CUS',
    sku: 'SKU',
  };
}

export function defaultSettings(lang: Lang = 'ja', currency: CurrencyCode = 'JPY'): Settings {
  const now = Date.now();
  return {
    id: 'app',
    shopName: '',
    shopPhone: '',
    shopAddress: '',
    taxCode: '',
    logo: '',
    businessType: 'retail',
    currency,
    lang,
    weekStartsOn: lang === 'ja' ? 0 : 1,
    theme: 'light',
    taxMode: lang === 'ja' ? 'inclusive' : 'none',
    taxRate: currency === 'JPY' ? 10 : 8,
    taxRates: { standard: currency === 'JPY' ? 1000 : 800, reduced: 800 },
    taxRounding: currency === 'JPY' ? 'floor' : 'round',
    eatInRule: false,
    serviceChargeRate: 0,
    roundTo: CURRENCIES[currency].defaultRoundTo,
    receiptWidth: 80,
    receiptFooter: '',
    receiptShowLogo: true,
    receiptShowQr: false,
    bankInfo: '',
    printAfterPay: false,
    requireLogin: false,
    negativeStock: true,
    orderPrefix: docPrefixes(lang).order.retail,
    nextOrderNo: 1,
    loyaltyEnabled: false,
    loyaltyEarnPer: currency === 'VND' ? 10000 : 100,
    loyaltyPointValue: currency === 'VND' ? 100 : 1,
    backup: {
      auto: false,
      intervalMin: 30,
      keep: 20,
      folderLabel: '',
      lastAt: 0,
      lastError: '',
      onOrderCount: 0,
    },
    onboarded: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function defaultOwner(name: string): User {
  return {
    id: newId('u'),
    name,
    pin: '',
    role: 'owner',
    active: true,
    color: PALETTE[0],
    createdAt: Date.now(),
  };
}

/** 業種別の伝票番号プレフィックス初期値を返す。 */
export const ORDER_PREFIX: Record<BusinessType, string> = {
  retail: 'HD',
  cafe: 'CF',
  restaurant: 'NH',
};

export const EXPENSE_CATEGORIES = [
  'rent',
  'salary',
  'utilities',
  'supplies',
  'marketing',
  'maintenance',
  'tax',
  'other',
] as const;

export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORIES)[number];
