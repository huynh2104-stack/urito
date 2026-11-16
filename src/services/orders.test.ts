import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { defaultOwner, defaultSettings } from '@/db/defaults';
import { useCart } from '@/store/cart';
import { findOpenOrderForTable, holdOrder, payOrder, PaymentShortfallError, refundOrder, reservedByOpenOrders, StockError, voidOrder } from './orders';
import { loadShiftData, openShift } from './shifts';
import { dayKey } from '@/core/date';
import type { Customer, Product } from '@/db/types';

function product(stock: number): Product {
  return {
    id: 'p1', sku: 'A', barcode: '', name: 'A', categoryId: '', price: 1000, cost: 500, unit: '',
    trackStock: true, stock, minStock: 0, isService: false, active: true, color: '#000000', image: '',
    modifierGroupIds: [], favorite: false, sort: 0, createdAt: 0, updatedAt: 0,
  };
}

describe('マイナス在庫禁止時の在庫引当ガード', () => {
  const settings = { ...defaultSettings(), negativeStock: false };
  const user = defaultOwner('Owner');
  const ctx = { user, settings, shiftId: null };

  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.settings.put(settings);
    await db.products.put(product(4));
    useCart.getState().clear();
  });

  const fill = (qty: number) => {
    useCart.getState().clear();
    useCart.getState().addProduct(product(4), { qty });
  };

  it('保留伝票が在庫を確保し、残数不足の別会計は拒否される', async () => {
    fill(4);
    await holdOrder(useCart.getState(), ctx);
    expect((await reservedByOpenOrders(null)).get('p1')).toBe(4);

    fill(4);
    await expect(
      payOrder({ cart: useCart.getState(), ctx, payments: [{ method: 'cash', amount: 4000 }], allowDebt: false }),
    ).rejects.toBeInstanceOf(StockError);
    expect((await db.products.get('p1'))!.stock).toBe(4);
  });

  it('保留伝票自身は確保分の在庫を使って決済を完了できる', async () => {
    fill(4);
    const held = await holdOrder(useCart.getState(), ctx);
    useCart.getState().clear();
    useCart.getState().loadOrder(held);
    await payOrder({ cart: useCart.getState(), ctx, payments: [{ method: 'cash', amount: 4000 }], allowDebt: false });
    expect((await db.products.get('p1'))!.stock).toBe(0);
  });

  it('保留後に棚卸等で在庫がゼロになった伝票は決済を拒否する', async () => {
    fill(4);
    const held = await holdOrder(useCart.getState(), ctx);
    await db.products.update('p1', { stock: 0 }); // 棚卸等による在庫減を模擬
    useCart.getState().clear();
    useCart.getState().loadOrder(held);
    await expect(
      payOrder({ cart: useCart.getState(), ctx, payments: [{ method: 'cash', amount: 4000 }], allowDebt: false }),
    ).rejects.toBeInstanceOf(StockError);
  });
});

describe('別シフトでの返金・取消とポイント・売掛金相殺 (B-02)', () => {
  const user = defaultOwner('店主');

  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.kv.put({ key: 'device.no', value: '01' });
    await db.kv.put({ key: 'seq.order', value: 0 });
    await db.kv.put({ key: 'seq.shift', value: 0 });
    await db.products.put(product(20));
    useCart.getState().clear();
  });

  it('シフト1で販売した伝票をシフト2で返金すると、シフト2の想定現金のみが減少しシフト1の在高は維持される', async () => {
    const settings = { ...defaultSettings('ja', 'JPY'), negativeStock: false };
    await db.settings.put(settings);

    const shift1 = await openShift(user, 10_000);
    useCart.getState().addProduct(product(20), { qty: 2 }); // 2000
    const order = await payOrder({
      cart: useCart.getState(),
      ctx: { user, settings, shiftId: shift1.id },
      payments: [{ method: 'cash', amount: 2000 }],
      allowDebt: false,
    });
    await db.shifts.update(shift1.id, { status: 'closed', closedAt: Date.now() });

    const shift2 = await openShift(user, 5_000);
    await refundOrder({
      order,
      lines: [{ itemId: order.items[0].id, qty: 1 }],
      reason: '返品',
      method: 'cash',
      restock: true,
      user,
      shiftId: shift2.id,
    });

    const data1 = await loadShiftData(shift1);
    const data2 = await loadShiftData(shift2);
    expect(data1.totals.expectedCash).toBe(12_000);
    expect(data1.totals.cashRefunds).toBe(0);
    expect(data2.totals.cashRefunds).toBe(1_000);
    expect(data2.totals.expectedCash).toBe(4_000);
  });

  it('シフト1の現金販売をシフト2で取消すると、シフト2に返金仕訳が計上され売掛金・ポイントも戻る', async () => {
    const settings = {
      ...defaultSettings('ja', 'JPY'),
      loyaltyEnabled: true,
      loyaltyEarnPer: 1000,
      loyaltyPointValue: 10,
      negativeStock: false,
    };
    await db.settings.put(settings);

    const customer: Customer = {
      id: 'c1',
      code: 'CU0001',
      name: '田中',
      phone: '',
      address: '',
      note: '',
      points: 50,
      debt: 0,
      totalSpent: 0,
      orderCount: 0,
      birthday: '',
      active: true,
      createdAt: 0,
      updatedAt: 0,
    };
    await db.customers.put(customer);

    const shift1 = await openShift(user, 10_000);
    useCart.getState().addProduct(product(20), { qty: 3 }); // 3000
    useCart.getState().setCustomer('c1', '田中', 50);
    useCart.getState().setPointsUsed(20); // -200 -> 請求2800
    const order = await payOrder({
      cart: useCart.getState(),
      ctx: { user, settings, shiftId: shift1.id },
      payments: [{ method: 'cash', amount: 2000 }], // 800円は売掛金
      allowDebt: true,
    });

    let c = (await db.customers.get('c1'))!;
    expect(c.points).toBe(50 - 20 + 2); // 32
    expect(c.debt).toBe(800);

    await db.shifts.update(shift1.id, { status: 'closed', closedAt: Date.now() });
    const shift2 = await openShift(user, 5_000);

    await voidOrder(order, '打ち間違い', user, shift2.id);

    const data1 = await loadShiftData(shift1);
    const data2 = await loadShiftData(shift2);
    expect(data1.totals.expectedCash).toBe(12_000);
    // 2800円のうち800円は売掛金相殺、実現金返金は2000円
    expect(data2.totals.cashRefunds).toBe(2_000);
    expect(data2.totals.expectedCash).toBe(3_000);

    c = (await db.customers.get('c1'))!;
    expect(c.points).toBe(50);
    expect(c.debt).toBe(0);
  });
});

describe('支払額不足ガードとプロモーション利用回数トランザクション更新 (B-08)', () => {
  const user = defaultOwner('店主');

  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.kv.put({ key: 'device.no', value: '01' });
    await db.kv.put({ key: 'seq.order', value: 0 });
    await db.products.put(product(10));
    useCart.getState().clear();
  });

  it('allowDebt が false で支払額が合計未満のとき PaymentShortfallError を投げ、注文を保存しない', async () => {
    const settings = defaultSettings('ja', 'JPY');
    await db.settings.put(settings);
    useCart.getState().addProduct(product(10), { qty: 2 }); // 2000

    await expect(
      payOrder({
        cart: useCart.getState(),
        ctx: { user, settings, shiftId: null },
        payments: [{ method: 'cash', amount: 1500 }],
        allowDebt: false,
      }),
    ).rejects.toBeInstanceOf(PaymentShortfallError);

    expect(await db.orders.count()).toBe(0);
    expect((await db.products.get('p1'))!.stock).toBe(10);
  });

  it('カートに promotionId がある状態で決済すると、同一トランザクション内で usageCount が +1 される', async () => {
    const settings = defaultSettings('ja', 'JPY');
    await db.settings.put(settings);
    await db.promotions.put({
      id: 'pr1',
      code: 'SALE10',
      name: '10%割引',
      type: 'percent',
      value: 10,
      minTotal: 0,
      startAt: 0,
      endAt: 0,
      active: true,
      usageCount: 2,
    });

    useCart.getState().addProduct(product(10), { qty: 1 }); // 1000 -> -10% = 900
    useCart.getState().setDiscount('percent', 10, '10%割引', 'pr1');

    const order = await payOrder({
      cart: useCart.getState(),
      ctx: { user, settings, shiftId: null },
      payments: [{ method: 'cash', amount: 900 }],
      allowDebt: false,
    });

    expect(order.total).toBe(900);
    expect((await db.promotions.get('pr1'))!.usageCount).toBe(3);
  });

  it('payOrder 完了時に dailyStats と dailyProductStats が即座に更新され、テーブル検索も機能する (C-04/C-07)', async () => {
    const settings = defaultSettings('ja', 'JPY');
    await db.settings.put(settings);
    useCart.getState().setTable('t1', 'A1');
    useCart.getState().addProduct(product(10), { qty: 2 });
    const held = await holdOrder(useCart.getState(), { user, settings, shiftId: null });
    expect((await findOpenOrderForTable('t1'))?.id).toBe(held.id);

    useCart.getState().clear();
    useCart.getState().loadOrder(held);
    const paid = await payOrder({
      cart: useCart.getState(),
      ctx: { user, settings, shiftId: null },
      payments: [{ method: 'cash', amount: 2000 }],
      allowDebt: false,
    });

    expect(await findOpenOrderForTable('t1')).toBeUndefined();
    const today = dayKey(paid.paidAt);
    const stat = await db.dailyStats.get(today);
    expect(stat?.orderCount).toBe(1);
    expect(stat?.revenue).toBe(2000);
    const prodStat = await db.dailyProductStats.get([today, 'p1']);
    expect(prodStat?.qty).toBe(2);
    expect(prodStat?.revenue).toBe(2000);
  });
});
