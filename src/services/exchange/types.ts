import type { CurrencyCode } from '@/db/types';

export interface ExchangeProductRow {
  sku: string;
  name: string;
  description?: string;
  category: string;
  unit: string;
  price: number;
  cost: number;
  stock: number | null;
  minStock: number | null;
  barcode: string;
  image: string;
  taxable: boolean;
  isService: boolean;
  active: boolean;
}

export interface ExchangeExportContext {
  currency: CurrencyCode;
  categoryNames: Map<string, string>;
  shopName?: string;
}

export interface ExchangeImportContext {
  currency: CurrencyCode;
}

export type ExchangeFormat = 'urito' | 'shopify';
