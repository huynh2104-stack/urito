import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { computeTotals } from '@/core/cart';
import { db } from '../db';
import { ean13CheckDigit } from '@/lib/barcode';
import { seedWorkspace } from './index';

describe('日本市場向けサンプルデータ(うりと商店・喫茶・食堂)のシード検証 (D-06)', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('小売「うりと商店」は31品・軽減/標準税率・有効JAN13・在庫僅少品・売掛客・返金履歴を含む', async () => {
    await seedWorkspace({
      businessType: 'retail',
      lang: 'ja',
      currency: 'JPY',
      shopName: 'うりと商店',
      ownerName: '店主',
      withSampleData: true,
      withSampleHistory: true,
      loadImages: false,
    });

    const products = await db.products.toArray();
    expect(products).toHaveLength(31);
    // 軽減税率 23品 (R01-R23) と 標準税率 8品 (R24-R31)
    expect(products.filter((p) => p.taxCategory === 'reduced')).toHaveLength(23);
    expect(products.filter((p) => p.taxCategory === 'standard')).toHaveLength(8);
    // R01-R31 すべての社内JANがプレフィックス20・13桁チェックデジット有効
    for (const p of products) {
      expect(p.barcode).toMatch(/^20\d{11}$/);
      expect(ean13CheckDigit(p.barcode.slice(0, 12))).toBe(Number(p.barcode[12]));
      expect(p.kana).toBeTruthy();
    }
    // 在庫僅少サンプルが存在する
    expect(products.some((p) => p.trackStock && p.stock <= p.minStock)).toBe(true);

    const customers = await db.customers.toArray();
    expect(customers.some((c) => c.debt > 0)).toBe(true);

    const orders = await db.orders.toArray();
    expect(orders.length).toBeGreaterThan(80);
    expect(orders.some((o) => o.refunds.length > 0)).toBe(true);
    // payOrder相当の税計算で算出されていること（複数税率明細整合性）
    const settings = (await db.settings.get('app'))!;
    const first = orders[0];
    const recomputed = computeTotals({
      items: first.items,
      discountType: first.discountType,
      discountValue: first.discountValue,
      serviceChargeRate: settings.serviceChargeRate,
      taxMode: settings.taxMode,
      taxRate: settings.taxRate,
      taxRates: settings.taxRates,
      taxRounding: settings.taxRounding,
      orderType: first.type,
      eatInRule: settings.eatInRule,
      roundTo: settings.roundTo,
    });
    expect(first.total).toBe(recomputed.total);
    expect(first.tax).toBe(recomputed.tax);
  });

  it('カフェ「喫茶うりと」は12品・店内飲食税率切替有効・座席エリア付きでシードされる', async () => {
    await seedWorkspace({
      businessType: 'cafe',
      lang: 'ja',
      currency: 'JPY',
      shopName: '喫茶うりと',
      ownerName: '店主',
      withSampleData: true,
      withSampleHistory: true,
      loadImages: false,
    });

    const settings = (await db.settings.get('app'))!;
    expect(settings.eatInRule).toBe(true);
    const products = await db.products.toArray();
    expect(products).toHaveLength(12);
    expect(await db.diningTables.count()).toBe(10);

    const orders = await db.orders.toArray();
    expect(orders.some((o) => o.type === 'dine_in')).toBe(true);
    expect(orders.some((o) => o.type === 'takeaway')).toBe(true);
  });

  it('食堂「うりと食堂」は12品・酒類のみ標準10%固定・定食持ち帰り8%でシードされる', async () => {
    await seedWorkspace({
      businessType: 'restaurant',
      lang: 'ja',
      currency: 'JPY',
      shopName: 'うりと食堂',
      ownerName: '店主',
      withSampleData: true,
      withSampleHistory: false,
      loadImages: false,
    });

    const products = await db.products.toArray();
    expect(products).toHaveLength(12);
    const beer = products.find((p) => p.name.includes('生ビール'));
    const setMeal = products.find((p) => p.name.includes('生姜焼き'));
    expect(beer?.taxCategory).toBe('standard');
    expect(setMeal?.taxCategory).toBe('reduced');
  });
});
