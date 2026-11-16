import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from '@/services/csv';
import type { Product } from '@/db/types';
import { exportShopifyCsv, isShopifyProductCsv, parseShopifyProductCsv } from './shopify';

const sampleProducts = (): Product[] => [
  {
    id: 'p1',
    sku: 'URT-0001',
    barcode: '4900000000016',
    name: 'ミネラルウォーター 500ml',
    kana: 'みねらるうぉーたー',
    categoryId: 'cat_drink',
    price: 110,
    cost: 60,
    unit: '本',
    trackStock: true,
    stock: 32,
    minStock: 6,
    isService: false,
    active: true,
    color: '#0ea5e9',
    image: '',
    modifierGroupIds: [],
    favorite: true,
    taxCategory: 'reduced',
    i18n: { ja: { description: '天然水 500ml' }, en: { name: 'Mineral Water 500ml' } },
    sort: 0,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'p2',
    sku: 'URT-0002',
    barcode: '',
    name: 'レジ袋（包装）',
    categoryId: 'cat_svc',
    price: 5,
    cost: 2,
    unit: '枚',
    trackStock: false,
    stock: 0,
    minStock: 0,
    isService: true,
    active: false,
    color: '#64748b',
    image: '',
    modifierGroupIds: [],
    favorite: false,
    taxCategory: 'exempt',
    sort: 1,
    createdAt: 1,
    updatedAt: 1,
  },
];

describe('Shopify 互換 CSV エクスポート・インポート (F-01)', () => {
  it('Shopify CSV の往復変換で商品名・SKU・バーコード・原価・価格・課税フラグが一致する', () => {
    const categories = new Map([
      ['cat_drink', '飲料'],
      ['cat_svc', 'サービス'],
    ]);
    const csvMatrix = exportShopifyCsv(sampleProducts(), {
      currency: 'JPY',
      categoryNames: categories,
      shopName: 'うりと商店',
    });
    const text = toCsv(csvMatrix);
    const parsedTable = parseCsv(text);

    expect(isShopifyProductCsv(parsedTable[0])).toBe(true);
    const rows = parseShopifyProductCsv(parsedTable, { currency: 'JPY' });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sku: 'URT-0001',
      name: 'ミネラルウォーター 500ml',
      category: '飲料',
      price: 110,
      cost: 60,
      stock: 32,
      barcode: '4900000000016',
      taxable: true,
      isService: false,
      active: true,
    });
    expect(rows[1]).toMatchObject({
      sku: 'URT-0002',
      name: 'レジ袋（包装）',
      taxable: false,
      isService: true,
      active: false,
    });
  });

  it('fixtures/shopify-sample.csv の複数バリエーション・画像専用行・USD小数を正しく解釈する', () => {
    const raw = readFileSync(join(process.cwd(), 'fixtures', 'shopify-sample.csv'), 'utf8');
    const table = parseCsv(raw);
    expect(isShopifyProductCsv(table[0])).toBe(true);

    const rows = parseShopifyProductCsv(table, { currency: 'JPY' });
    expect(rows).toHaveLength(4);
    expect(rows[0].name).toBe('緑茶 500ml');
    expect(rows[0].image).toBe('https://example.com/tea.jpg');

    // バリエーション2行 + 画像追加専用行1行が3つめの商品にならず2商品として展開される
    expect(rows[1].name).toBe('ドリップコーヒー 10袋 (中煎り)');
    expect(rows[1].sku).toBe('R-0101');
    expect(rows[2].name).toBe('ドリップコーヒー 10袋 (深煎り)');
    expect(rows[2].sku).toBe('R-0102');
    expect(rows[2].price).toBe(720);
    // 画像専用行により親バリエーション行へ画像URLが補完される
    expect(rows[1].image).toBe('https://example.com/coffee-sub.jpg');

    // 非課税・配送不要サービス・下書きステータス
    expect(rows[3]).toMatchObject({
      sku: 'R-0901',
      price: 200,
      taxable: false,
      isService: true,
      active: false,
    });
  });

  it('USD 通貨設定時に Shopify 価格文字列 ("12.50") がセント整数 1250 に変換される', () => {
    const csv = [
      'Handle,Title,Variant Price,Cost per item',
      'latte,Cafe Latte,12.50,4.25',
    ].join('\n');
    const rows = parseShopifyProductCsv(parseCsv(csv), { currency: 'USD' });
    expect(rows[0].price).toBe(1250);
    expect(rows[0].cost).toBe(425);
  });
});
