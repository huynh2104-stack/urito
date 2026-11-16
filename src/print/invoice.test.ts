import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { defaultSettings } from '@/db/defaults';
import { sampleOrder } from '@/features/settings/sampleOrder';
import { orderTaxLinesForDisplay } from '@/core/tax';
import { translate } from '@/i18n';
import { extractDeviceNo, isReducedTaxItem, localizeOrderForPrint } from './Receipt';

describe('適格簡易請求書(インボイス)ヘルパーと内訳計算 (D-02)', () => {
  it('伝票番号からレジ端末番号を接頭辞に依存せず正しく抽出できる', () => {
    expect(extractDeviceNo('ORD01-261116-0042', 'ORD')).toBe('01');
    expect(extractDeviceNo('HDA2-261116-0009', 'HD')).toBe('A2');
    expect(extractDeviceNo('ORD-261116-0001', 'ORD')).toBe('');
  });

  it('軽減税率対象(8%)アイテムのみ ※マーク判定となり、店内飲食ルール時は標準税率扱いとなる', () => {
    const settings = defaultSettings('ja', 'JPY');
    const order = sampleOrder(settings);
    expect(order.items).toHaveLength(2);
    expect(isReducedTaxItem(order.items[0], 'retail', order.taxMode, settings)).toBe(false);
    expect(isReducedTaxItem(order.items[1], 'retail', order.taxMode, settings)).toBe(true);

    // 店内飲食(イートイン)ルール有効時、taxRateBp が 1000 の商品は軽減対象外になる
    const dineInSettings = { ...settings, eatInRule: true };
    const dineInReducedItem = { ...order.items[1], taxRateBp: 1000 };
    expect(isReducedTaxItem(dineInReducedItem, 'dine_in', 'inclusive', dineInSettings)).toBe(false);
  });

  it('sampleOrder で 10% と 8% の複数税率内訳が正しく集計される', () => {
    const settings = defaultSettings('ja', 'JPY');
    const order = sampleOrder(settings);
    const lines = orderTaxLinesForDisplay(order);
    expect(lines.map((l) => l.rateBp)).toEqual([1000, 800]);
    expect(lines[0].gross).toBe(900);
    expect(lines[0].tax).toBe(81);
    expect(lines[1].gross).toBe(380);
    expect(lines[1].tax).toBe(28);
  });

  it('F-02: localizeOrderForPrint により指定言語のレシート辞書と商品の多言語名が適用される', async () => {
    await db.open();
    await db.products.clear();
    const settings = defaultSettings('ja', 'JPY');
    const order = sampleOrder(settings);
    const targetId = order.items[0].productId;
    await db.products.put({
      id: targetId,
      sku: 'SKU-LOC',
      barcode: '',
      name: order.items[0].name,
      categoryId: '',
      price: 450,
      cost: 150,
      unit: '杯',
      trackStock: false,
      stock: 0,
      minStock: 0,
      isService: false,
      active: true,
      color: '#000',
      image: '',
      modifierGroupIds: [],
      favorite: false,
      i18n: { en: { name: 'Cafe Latte' }, vi: { name: 'Cà phê sữa' } },
      sort: 0,
      createdAt: 1,
      updatedAt: 1,
    });

    const enOrder = await localizeOrderForPrint(order, 'en');
    expect(enOrder.items[0].name).toBe('Cafe Latte');
    expect(translate('en', 'rc.invoice')).toBe('SALES INVOICE');
  });
});
