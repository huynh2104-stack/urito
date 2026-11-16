import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeLine, computeTotals } from './cart';
import { allocateLineNets, computeOrderRefund, refundAmountFor } from './refund';
import type { DiscountType, Order, OrderItem, TaxMode } from '@/db/types';

function makeItem(id: string, price: number, qty: number, discount = 0): OrderItem {
  const line = computeLine({
    price,
    qty,
    cost: Math.floor(price / 2),
    modifiers: [],
    discountType: discount > 0 ? 'amount' : 'none',
    discountValue: discount,
  });
  return {
    id,
    productId: `p_${id}`,
    name: `商品${id}`,
    unit: '個',
    price,
    cost: Math.floor(price / 2),
    qty,
    modifiers: [],
    discountType: discount > 0 ? 'amount' : 'none',
    discountValue: discount,
    note: '',
    gross: line.gross,
    discount: line.discount,
    total: line.total,
    refundedQty: 0,
  };
}

function makeOrder(
  items: OrderItem[],
  opts: {
    discountType?: DiscountType;
    discountValue?: number;
    serviceChargeRate?: number;
    taxMode?: TaxMode;
    taxRate?: number;
    roundTo?: number;
    pointsUsed?: number;
    pointsValue?: number;
  } = {},
): Order {
  const totals = computeTotals({
    items,
    discountType: opts.discountType ?? 'none',
    discountValue: opts.discountValue ?? 0,
    serviceChargeRate: opts.serviceChargeRate ?? 0,
    taxMode: opts.taxMode ?? 'none',
    taxRate: opts.taxRate ?? 0,
    roundTo: opts.roundTo ?? 1,
    pointsUsed: opts.pointsUsed ?? 0,
    pointsValue: opts.pointsValue ?? 0,
  });
  return {
    id: 'o1',
    code: 'HD-0001',
    type: 'retail',
    status: 'paid',
    tableId: null,
    tableName: '',
    guests: 1,
    customerId: null,
    customerName: '',
    items,
    subtotal: totals.subtotal,
    discountType: opts.discountType ?? 'none',
    discountValue: opts.discountValue ?? 0,
    discount: totals.discount,
    serviceCharge: totals.serviceCharge,
    taxMode: opts.taxMode ?? 'none',
    taxRate: opts.taxRate ?? 0,
    tax: totals.tax,
    rounding: totals.rounding,
    total: totals.total,
    cogs: totals.cogs,
    paidAmount: totals.total,
    changeAmount: 0,
    dueAmount: 0,
    payments: [],
    refunds: [],
    refundedAmount: 0,
    pointsEarned: 0,
    pointsUsed: opts.pointsUsed ?? 0,
    pointsValue: totals.pointsRedeemed,
    note: '',
    userId: 'u1',
    userName: 'Staff',
    shiftId: 'sh1',
    createdAt: 0,
    updatedAt: 0,
    paidAt: 0,
    voidedAt: 0,
    voidReason: '',
  };
}

describe('返金額計算 (src/core/refund.ts)', () => {
  it('10,400đを1,000đ単位で切り捨て丸め(10,000đ収受)した注文の全額返金が10,000đになる', () => {
    const item = makeItem('i1', 10_400, 1);
    const order = makeOrder([item], { roundTo: 1_000 });
    expect(order.rounding).toBe(-400);
    expect(order.total).toBe(10_000);
    expect(refundAmountFor(order, item, 1)).toBe(10_000);
  });

  it('切り上げ丸め(10,600đ→11,000đ収受)した注文の全額返金が11,000đになる', () => {
    const item = makeItem('i1', 10_600, 1);
    const order = makeOrder([item], { roundTo: 1_000 });
    expect(order.rounding).toBe(400);
    expect(order.total).toBe(11_000);
    expect(refundAmountFor(order, item, 1)).toBe(11_000);
  });

  it('伝票割引・サービス料・外税・ポイント利用が混在しても全額返金は請求合計と一致する', () => {
    const items = [makeItem('i1', 330, 2), makeItem('i2', 510, 1)];
    const order = makeOrder(items, {
      discountType: 'percent',
      discountValue: 10,
      serviceChargeRate: 5,
      taxMode: 'exclusive',
      taxRate: 10,
      pointsUsed: 20,
      pointsValue: 5,
    });
    const res = computeOrderRefund(
      order,
      items.map((i) => ({ itemId: i.id, qty: i.qty })),
    );
    expect(res.totalAmount).toBe(order.total);
  });

  it('複数回に分割して全数返金した合計は実収額と一致し上限を超えない', () => {
    const items = [makeItem('i1', 101, 3), makeItem('i2', 203, 2)];
    const order = makeOrder(items, {
      discountType: 'amount',
      discountValue: 50,
      taxMode: 'exclusive',
      taxRate: 10,
    });

    // 1回目：i1を1個、i2を1個返金
    const first = computeOrderRefund(order, [
      { itemId: 'i1', qty: 1 },
      { itemId: 'i2', qty: 1 },
    ]);
    const afterFirst: Order = {
      ...order,
      items: order.items.map((i) => ({ ...i, refundedQty: 1 })),
      refunds: [{ id: 'r1', at: 1, amount: first.totalAmount, reason: '', method: 'cash', userId: 'u1', items: first.items, restock: true }],
      refundedAmount: first.totalAmount,
    };

    // 2回目：残りを全数返金
    const second = computeOrderRefund(afterFirst, [
      { itemId: 'i1', qty: 2 },
      { itemId: 'i2', qty: 1 },
    ]);
    expect(first.totalAmount + second.totalAmount).toBe(order.total);
  });

  it('プロパティテスト：任意の構成の注文でも明細按分の総和はtotalと一致し部分返金は残高を超えない', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            price: fc.integer({ min: 10, max: 50_000 }),
            qty: fc.integer({ min: 1, max: 20 }),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        fc.integer({ min: 0, max: 30 }),
        fc.integer({ min: 0, max: 15 }),
        fc.constantFrom<TaxMode>('none', 'inclusive', 'exclusive'),
        fc.constantFrom(1, 10, 1000),
        fc.integer({ min: 0, max: 50 }),
        (rawItems, discountPct, servicePct, taxMode, roundTo, pointsUsed) => {
          const items = rawItems.map((r, idx) => makeItem(`i${idx}`, r.price, r.qty));
          const order = makeOrder(items, {
            discountType: discountPct > 0 ? 'percent' : 'none',
            discountValue: discountPct,
            serviceChargeRate: servicePct,
            taxMode,
            taxRate: 10,
            roundTo,
            pointsUsed,
            pointsValue: 10,
          });
          const nets = allocateLineNets(order);
          const netSum = [...nets.values()].reduce((s, v) => s + v, 0);
          expect(netSum).toBe(order.total);

          const full = computeOrderRefund(
            order,
            items.map((i) => ({ itemId: i.id, qty: i.qty })),
          );
          expect(full.totalAmount).toBe(order.total);

          const partial = computeOrderRefund(
            order,
            items.map((i) => ({ itemId: i.id, qty: Math.max(1, Math.floor(i.qty / 2)) })),
          );
          expect(partial.totalAmount).toBeGreaterThanOrEqual(0);
          expect(partial.totalAmount).toBeLessThanOrEqual(order.total);
        },
      ),
      { numRuns: 100 },
    );
  });
});
