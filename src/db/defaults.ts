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

export function defaultSettings(lang: Lang = 'vi', currency: CurrencyCode = 'VND'): Settings {
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
    orderPrefix: 'HD',
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

/** Prefix per business type - what a shop of this kind expects on a receipt. */
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
