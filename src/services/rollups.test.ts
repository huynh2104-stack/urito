import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
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

  it('プロパティテスト：ランダムな販売・一部返金・取消列の増分更新が rebuildRollups の全件再構築と一致する', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            dayOffset: fc.integer({ min: 0, max: 4 }),
            price: fc.integer({ min: 100, max: 5000 }),
            qty: fc.integer({ min: 1, max: 5 }),
            action: fc.constantFrom<'keep' | 'partial_refund' | 'void'>('keep', 'partial_refund', 'void'),
          }),
          { minLength: 1, maxLength: 12 },
        ),
        async (ops) => {
          await Promise.all(db.tables.map((t) => t.clear()));
          const base = new Date('2026-11-10T10:00:00').getTime();

          for (let idx = 0; idx < ops.length; idx++) {
            const op = ops[idx];
            const ts = base + op.dayOffset * 86_400_000;
            const total = op.price * op.qty;
            const tax = Math.floor((total * 1000) / 11000);
            const paidOrder = makeOrder({
              id: `ord_${idx}`,
              code: `ORD-${idx}`,
              createdAt: ts,
              paidAt: ts,
              updatedAt: ts,
              subtotal: total,
              total,
              tax,
              taxLines: [{ rateBp: 1000, gross: total, net: total - tax, tax }],
              paidAmount: total,
              payments: [{ id: `pm_${idx}`, method: 'cash', amount: total, ref: '', at: ts }],
              items: [
                {
                  id: `it_${idx}`,
                  productId: `p_${idx % 3}`,
                  name: `商品${idx % 3}`,
                  unit: '個',
                  price: op.price,
                  cost: Math.floor(op.price / 2),
                  qty: op.qty,
                  modifiers: [],
                  discountType: 'none',
                  discountValue: 0,
                  note: '',
                  gross: total,
                  discount: 0,
                  total,
                  refundedQty: 0,
                  taxCategory: 'standard',
                  taxRateBp: 1000,
                },
              ],
            });
            await db.orders.put(paidOrder);
            await applyOrderRollupDelta(null, paidOrder);

            if (op.action === 'partial_refund') {
              const refTs = ts + 86_400_000;
              const refAmt = op.price;
              const refunded: Order = {
                ...paidOrder,
                status: op.qty === 1 ? 'refunded' : 'paid',
                refundedAmount: refAmt,
                items: [{ ...paidOrder.items[0], refundedQty: 1 }],
                refunds: [
                  {
                    id: `rf_${idx}`,
                    at: refTs,
                    amount: refAmt,
                    reason: '返品',
                    method: 'cash',
                    userId: 'u1',
                    items: [{ itemId: `it_${idx}`, qty: 1, amount: refAmt }],
                    restock: true,
                  },
                ],
                updatedAt: refTs,
              };
              await db.orders.put(refunded);
              await applyOrderRollupDelta(paidOrder, refunded);
            } else if (op.action === 'void') {
              const voidTs = ts + 3600_000;
              const voided: Order = {
                ...paidOrder,
                status: 'void',
                refundedAmount: total,
                voidedAt: voidTs,
                voidReason: '取消',
                refunds: [
                  {
                    id: `vf_${idx}`,
                    at: voidTs,
                    amount: total,
                    reason: '取消',
                    method: 'cash',
                    userId: 'u1',
                    items: [{ itemId: `it_${idx}`, qty: op.qty, amount: total }],
                    restock: true,
                  },
                ],
                updatedAt: voidTs,
              };
              await db.orders.put(voided);
              await applyOrderRollupDelta(paidOrder, voided);
            }
          }

          const deltaDaily = await db.dailyStats.orderBy('day').toArray();
          const deltaProd = await db.dailyProductStats.toArray();
          await rebuildRollups({ batchSize: 4 });
          const rebuiltDaily = await db.dailyStats.orderBy('day').toArray();
          const rebuiltProd = await db.dailyProductStats.toArray();

          expect(deltaDaily.map((d) => ({ ...d, updatedAt: 0 }))).toEqual(
            rebuiltDaily.map((d) => ({ ...d, updatedAt: 0 })),
          );
          expect(deltaProd.sort((a, b) => (a.day + a.productId).localeCompare(b.day + b.productId))).toEqual(
            rebuiltProd.sort((a, b) => (a.day + a.productId).localeCompare(b.day + b.productId)),
          );
        },
      ),
      { numRuns: 20 },
    );
  });
});
