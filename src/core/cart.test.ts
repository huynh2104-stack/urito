import { describe, expect, it } from 'vitest';
import { changeFor, computeLine, computeTotals, lineKey, pointsEarnedFor, unitPriceOf } from './cart';
import type { OrderItem } from '@/db/types';

const line = (over: Partial<Parameters<typeof computeLine>[0]> = {}) =>
  computeLine({
    price: 30_000,
    qty: 2,
    cost: 10_000,
    modifiers: [],
    discountType: 'none',
    discountValue: 0,
    ...over,
  });

const item = (total: number, cost = 0, qty = 1): Pick<OrderItem, 'total' | 'cost' | 'qty'> => ({
  total,
  cost,
  qty,
});

const totals = (over: Partial<Parameters<typeof computeTotals>[0]> = {}) =>
  computeTotals({
    items: [item(100_000, 40_000, 2)],
    discountType: 'none',
    discountValue: 0,
    serviceChargeRate: 0,
    taxMode: 'none',
    taxRate: 0,
    roundTo: 0,
    ...over,
  });

describe('computeLine', () => {
  it('multiplies price by quantity', () => {
    expect(line().gross).toBe(60_000);
    expect(line().total).toBe(60_000);
  });

  it('adds modifier prices to the unit price', () => {
    const withMods = line({ modifiers: [{ priceDelta: 5_000 }, { priceDelta: 8_000 }] });
    expect(withMods.gross).toBe((30_000 + 13_000) * 2);
  });

  it('applies a percentage discount to the whole line', () => {
    expect(line({ discountType: 'percent', discountValue: 10 }).discount).toBe(6_000);
    expect(line({ discountType: 'percent', discountValue: 10 }).total).toBe(54_000);
  });

  it('never discounts more than the line is worth', () => {
    expect(line({ discountType: 'amount', discountValue: 999_999 }).total).toBe(0);
    expect(line({ discountType: 'percent', discountValue: 500 }).total).toBe(0);
  });

  it('handles fractional quantities for goods sold by weight', () => {
    expect(line({ price: 165_000, qty: 0.35, cost: 0 }).gross).toBe(57_750);
  });

  it('rounds cost by quantity so COGS stays an integer', () => {
    expect(line({ qty: 0.333, cost: 10_000 }).cost).toBe(3_330);
  });

  it('exposes the unit price including modifiers', () => {
    expect(unitPriceOf({ price: 25_000, modifiers: [{ priceDelta: 10_000 }] })).toBe(35_000);
  });
});

describe('computeTotals', () => {
  it('sums the lines', () => {
    const result = totals({ items: [item(60_000), item(40_000)] });
    expect(result.subtotal).toBe(100_000);
    expect(result.total).toBe(100_000);
  });

  it('applies an order-level percentage discount', () => {
    const result = totals({ discountType: 'percent', discountValue: 15 });
    expect(result.discount).toBe(15_000);
    expect(result.total).toBe(85_000);
  });

  it('caps an order-level amount discount at the subtotal', () => {
    expect(totals({ discountType: 'amount', discountValue: 500_000 }).total).toBe(0);
  });

  it('adds VAT on top in exclusive mode', () => {
    const result = totals({ taxMode: 'exclusive', taxRate: 10 });
    expect(result.tax).toBe(10_000);
    expect(result.total).toBe(110_000);
  });

  it('extracts VAT from the price in inclusive mode without changing the total', () => {
    const result = totals({ taxMode: 'inclusive', taxRate: 10 });
    expect(result.total).toBe(100_000);
    expect(result.tax).toBe(9_091);
  });

  it('charges service before tax', () => {
    const result = totals({ serviceChargeRate: 5, taxMode: 'exclusive', taxRate: 10 });
    expect(result.serviceCharge).toBe(5_000);
    expect(result.tax).toBe(10_500);
    expect(result.total).toBe(115_500);
  });

  it('rounds the grand total to the configured step', () => {
    const result = totals({ items: [item(101_400)], roundTo: 1_000 });
    expect(result.total).toBe(101_000);
    expect(result.rounding).toBe(-400);
  });

  it('redeems loyalty points before rounding', () => {
    const result = totals({ pointsUsed: 50, pointsValue: 100 });
    expect(result.pointsRedeemed).toBe(5_000);
    expect(result.total).toBe(95_000);
  });

  it('never lets points redemption push the total below zero', () => {
    const result = totals({ pointsUsed: 99_999, pointsValue: 100 });
    expect(result.total).toBe(0);
  });

  it('reports profit net of tax and cost of goods', () => {
    const result = totals({ taxMode: 'exclusive', taxRate: 10 });
    expect(result.cogs).toBe(40_000);
    expect(result.profit).toBe(110_000 - 10_000 - 40_000);
  });

  it('counts units across lines, including fractional ones', () => {
    const result = totals({ items: [item(1, 0, 0.5), item(1, 0, 2)] });
    expect(result.unitCount).toBe(2.5);
    expect(result.itemCount).toBe(2);
  });
});

describe('helpers', () => {
  it('gives change only when the customer overpays', () => {
    expect(changeFor(100_000, 200_000)).toBe(100_000);
    expect(changeFor(100_000, 50_000)).toBe(0);
  });

  it('earns one point per full spending step', () => {
    expect(pointsEarnedFor(125_000, 10_000)).toBe(12);
    expect(pointsEarnedFor(125_000, 0)).toBe(0);
  });

  it('treats identical products with the same options as one cart line', () => {
    const a = lineKey('p1', [{ id: 'm1' }, { id: 'm2' }], '', 'none', 0);
    const b = lineKey('p1', [{ id: 'm2' }, { id: 'm1' }], '', 'none', 0);
    const c = lineKey('p1', [{ id: 'm1' }], '', 'none', 0);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('keeps lines separate when the notes differ', () => {
    expect(lineKey('p1', [], 'no ice', 'none', 0)).not.toBe(lineKey('p1', [], '', 'none', 0));
  });
});
