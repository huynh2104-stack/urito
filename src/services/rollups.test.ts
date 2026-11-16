import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { dayKey } from '@/core/date';
import { db } from '@/db/db';
import { applyOrderRollupDelta, ensureRollupsBuilt, rebuildRollups } from './rollups';
import { employeeStatsFromRollups, orderTypeStatsFromRollups, paymentStatsFromRollups, productStatsFromRollups, revenueByDayFromRollups, revenueByHourFromRollups, summariseRollups, taxLinesFromRollups } from './rollupQueries';
import { employeeStats, orderTypeStats, paymentStats, productStats, revenueByDay, revenueByHour, summarise, summariseTaxLines } from './reports';
import type { Order } from '@/db/types';

function makeOrder(over: Partial<Order> = {}): Order {
  const ts = new Date('2026-11-10T12:30:00').getTime();
  return {
    id: 'o1',
    code: 'R0001',
    type: 'retail',
    status: 'paid',
    tableId: null,
    tableName: '',
    guests: 1,
    customerId: null,
    customerName: '',
    items: [
      {
        id: 'i1',
        productId: 'p1',
        name: '商品A',
        unit: '個',
        price: 1100,
        cost: 500,
        qty: 2,
        modifiers: [],
        discountType: 'none',
        discountValue: 0,
        note: '',
        gross: 2200,
        discount: 0,
        total: 2200,
        refundedQty: 0,
        taxCategory: 'standard',
        taxRateBp: 1000,
      },
    ],
    subtotal: 2200,
    discountType: 'none',
    discountValue: 0,
    discount: 0,
    serviceCharge: 0,
    taxMode: 'inclusive',
    taxRate: 10,
    tax: 200,
    taxLines: [{ rateBp: 1000, gross: 2200, net: 2000, tax: 200 }],
    rounding: 0,
    total: 2200,
    cogs: 1000,
    paidAmount: 2200,
    changeAmount: 0,
    dueAmount: 0,
    payments: [{ id: 'pm1', method: 'cash', amount: 2200, ref: '', at: ts }],
    refunds: [],
    refundedAmount: 0,
    pointsEarned: 0,
    pointsUsed: 0,
    pointsValue: 0,
    note: '',
    userId: 'u1',
    userName: '店主',
    shiftId: null,
    createdAt: ts,
    updatedAt: ts,
    paidAt: ts,
    voidedAt: 0,
    voidReason: '',
    ...over,
  };
}

describe('rollups 日次・商品別集計テーブル (C-04)', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('rebuildRollups と reports.ts の集計結果が日跨ぎ返金・一部返金・取消を含め完全一致する', async () => {
    const day1 = new Date('2026-11-10T10:00:00').getTime();
    const day2 = new Date('2026-11-11T15:00:00').getTime();
    const o1 = makeOrder({ id: 'o1', paidAt: day1, createdAt: day1 });
    const o2 = makeOrder({
      id: 'o2',
      code: 'R0002',
      status: 'refunded',
      paidAt: day1,
      createdAt: day1,
      refundedAmount: 1100,
      items: [{ ...makeOrder().items[0], refundedQty: 1 }],
      refunds: [
        {
          id: 'rf1',
          at: day2,
          amount: 1100,
          reason: '一部返品',
          method: 'cash',
          userId: 'u1',
          items: [{ itemId: 'i1', qty: 1, amount: 1100 }],
          restock: true,
        },
      ],
    });
    const o3 = makeOrder({
      id: 'o3',
      code: 'R0003',
      status: 'void',
      paidAt: day2,
      createdAt: day2,
      voidedAt: day2 + 60_000,
      refundedAmount: 2200,
      refunds: [
        {
          id: 'rf2',
          at: day2 + 60_000,
          amount: 2200,
          reason: '入力誤り',
          method: 'cash',
          userId: 'u1',
          items: [{ itemId: 'i1', qty: 2, amount: 2200 }],
          restock: true,
        },
      ],
    });
    const oOpen = makeOrder({ id: 'o_open', status: 'open', paidAt: 0, createdAt: day2 });

    await db.orders.bulkPut([o1, o2, o3, oOpen]);
    await rebuildRollups({ batchSize: 2 });

    const rows = await db.dailyStats.toArray();
    const prodRows = await db.dailyProductStats.toArray();
    const allOrders = [o1, o2, o3];
    const range = {
      from: new Date('2026-11-10T00:00:00').getTime(),
      to: new Date('2026-11-11T23:59:59.999').getTime(),
    };

    expect(summariseRollups(rows)).toEqual(summarise(allOrders, [], allOrders, range));
    expect(revenueByDayFromRollups(rows, range.from, range.to, 'ja')).toEqual(
      revenueByDay(allOrders, range.from, range.to, allOrders, 'ja'),
    );
    expect(revenueByHourFromRollups(rows)).toEqual(revenueByHour(allOrders));
    expect(productStatsFromRollups(prodRows)).toEqual(productStats(allOrders));
    expect(paymentStatsFromRollups(rows)).toEqual(paymentStats(allOrders));
    expect(employeeStatsFromRollups(rows)).toEqual(employeeStats(allOrders));
    expect(orderTypeStatsFromRollups(rows)).toEqual(orderTypeStats(allOrders));
    expect(taxLinesFromRollups(rows)).toEqual(summariseTaxLines(allOrders));
  });

  it('applyOrderRollupDelta の増分更新が rebuildRollups と一致する', async () => {
    const o1 = makeOrder();
    await db.orders.put(o1);
    await applyOrderRollupDelta(null, o1);

    const day2 = new Date('2026-11-12T11:00:00').getTime();
    const refunded: Order = {
      ...o1,
      status: 'refunded',
      refundedAmount: 1100,
      items: [{ ...o1.items[0], refundedQty: 1 }],
      refunds: [
        {
          id: 'rf1',
          at: day2,
          amount: 1100,
          reason: '一部返品',
          method: 'cash',
          userId: 'u1',
          items: [{ itemId: 'i1', qty: 1, amount: 1100 }],
          restock: true,
        },
      ],
    };
    await db.orders.put(refunded);
    await applyOrderRollupDelta(o1, refunded);

    const deltaDaily = await db.dailyStats.orderBy('day').toArray();
    const deltaProd = await db.dailyProductStats.toArray();

    await rebuildRollups();
    const rebuiltDaily = await db.dailyStats.orderBy('day').toArray();
    const rebuiltProd = await db.dailyProductStats.toArray();

    expect(deltaDaily.map((d) => ({ ...d, updatedAt: 0 }))).toEqual(
      rebuiltDaily.map((d) => ({ ...d, updatedAt: 0 })),
    );
    expect(deltaProd).toEqual(rebuiltProd);
    expect(deltaDaily.find((d) => d.day === dayKey(day2))?.refunds).toBe(1100);
  });

  it('ensureRollupsBuilt は既存データがあり集計が空の場合のみ構築する', async () => {
    const o1 = makeOrder();
    await db.orders.put(o1);
    await ensureRollupsBuilt();
    expect(await db.dailyStats.count()).toBe(1);
    expect(await db.dailyProductStats.count()).toBe(1);
  });
});
