import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DAY, endOfDay, startOfDay } from '@/core/date';
import { db } from '@/db/db';
import type { Order } from '@/db/types';
import { revenueByDay, summarise } from './reports';

function sampleOrder(over: Partial<Order> = {}): Order {
  const now = Date.now();
  return {
    id: 'o1',
    code: 'ORD-0001',
    type: 'retail',
    status: 'paid',
    tableId: null,
    tableName: '',
    guests: 1,
    customerId: null,
    customerName: '',
    items: [],
    subtotal: 1000,
    discountType: 'none',
    discountValue: 0,
    discount: 0,
    serviceCharge: 0,
    taxMode: 'inclusive',
    taxRate: 10,
    tax: 90,
    rounding: 0,
    total: 1000,
    cogs: 400,
    paidAmount: 1000,
    changeAmount: 0,
    dueAmount: 0,
    payments: [{ id: 'pm1', method: 'cash', amount: 1000, ref: '', at: now }],
    refunds: [],
    refundedAmount: 0,
    pointsEarned: 0,
    pointsUsed: 0,
    pointsValue: 0,
    note: '',
    userId: 'u1',
    userName: 'Tester',
    shiftId: null,
    createdAt: now,
    updatedAt: now,
    paidAt: now,
    voidedAt: 0,
    voidReason: '',
    ...over,
  };
}

describe('reports 支払日時(paidAt)および返金日時(refund.at)基準の集計', () => {
  beforeEach(async () => {
    await db.orders.clear();
  });

  it('昨日保留して本日決済した伝票は本日の売上のみに計上される', async () => {
    const todayStart = startOfDay(new Date(2026, 4, 15, 12, 0, 0).getTime());
    const todayRange = { from: todayStart, to: endOfDay(todayStart) };
    const yesterdayStart = todayStart - DAY;
    const yesterdayRange = { from: yesterdayStart, to: endOfDay(yesterdayStart) };

    await db.orders.bulkPut([
      sampleOrder({
        id: 'o-held-yesterday',
        createdAt: yesterdayStart + 10_000,
        paidAt: todayStart + 3_600_000,
        total: 2500,
        tax: 227,
      }),
    ]);

    const yesterdayPaid = await db.orders
      .where('paidAt')
      .between(yesterdayRange.from, yesterdayRange.to, true, true)
      .toArray();
    const todayPaid = await db.orders
      .where('paidAt')
      .between(todayRange.from, todayRange.to, true, true)
      .toArray();

    expect(summarise(yesterdayPaid, [], [], yesterdayRange).revenue).toBe(0);
    const todaySum = summarise(todayPaid, [], [], todayRange);
    expect(todaySum.revenue).toBe(2500);
    expect(todaySum.orderCount).toBe(1);

    const series = revenueByDay(todayPaid, yesterdayRange.from, todayRange.to, []);
    expect(series.map((p) => p.value)).toEqual([0, 2500]);
  });

  it('昨日の伝票に対する本日の返金は本日の純売上から差し引かれる', async () => {
    const todayStart = startOfDay(new Date(2026, 4, 15, 12, 0, 0).getTime());
    const todayRange = { from: todayStart, to: endOfDay(todayStart) };
    const yesterdayStart = todayStart - DAY;
    const yesterdayRange = { from: yesterdayStart, to: endOfDay(yesterdayStart) };

    await db.orders.bulkPut([
      sampleOrder({
        id: 'o-yesterday',
        createdAt: yesterdayStart + 1_000,
        paidAt: yesterdayStart + 2_000,
        status: 'refunded',
        total: 1000,
        tax: 90,
        refundedAmount: 300,
        refunds: [
          {
            id: 'rf1',
            amount: 300,
            method: 'cash',
            reason: '一部返品',
            items: [],
            at: todayStart + 5_000,
            userId: 'u1',
            shiftId: 'sh-today',
            restock: false,
          },
        ],
      }),
      sampleOrder({
        id: 'o-today',
        createdAt: todayStart + 1_000,
        paidAt: todayStart + 2_000,
        total: 1500,
        tax: 136,
      }),
    ]);

    const todayPaid = await db.orders
      .where('paidAt')
      .between(todayRange.from, todayRange.to, true, true)
      .toArray();
    const todayRefundOrders = await db.orders
      .filter((o) => o.refunds.some((r) => r.at >= todayRange.from && r.at <= todayRange.to))
      .toArray();

    const todaySum = summarise(todayPaid, [], todayRefundOrders, todayRange);
    expect(todaySum.revenue).toBe(1500);
    expect(todaySum.refunds).toBe(300);
    expect(todaySum.netRevenue).toBe(1200);

    const yesterdayPaid = await db.orders
      .where('paidAt')
      .between(yesterdayRange.from, yesterdayRange.to, true, true)
      .toArray();
    const yesterdayRefundOrders = await db.orders
      .filter((o) => o.refunds.some((r) => r.at >= yesterdayRange.from && r.at <= yesterdayRange.to))
      .toArray();
    const yesterdaySum = summarise(yesterdayPaid, [], yesterdayRefundOrders, yesterdayRange);
    expect(yesterdaySum.revenue).toBe(1000);
    expect(yesterdaySum.refunds).toBe(0);
    expect(yesterdaySum.netRevenue).toBe(1000);
  });
});
