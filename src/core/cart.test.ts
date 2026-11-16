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

describe('computeLine 明細計算', () => {
  it('単価と数量を掛け合わせて小計を求める', () => {
    expect(line().gross).toBe(60_000);
    expect(line().total).toBe(60_000);
  });

  it('オプション価格を単価に加算する', () => {
    const withMods = line({ modifiers: [{ priceDelta: 5_000 }, { priceDelta: 8_000 }] });
    expect(withMods.gross).toBe((30_000 + 13_000) * 2);
  });

  it('明細全体に割引率を適用する', () => {
    expect(line({ discountType: 'percent', discountValue: 10 }).discount).toBe(6_000);
    expect(line({ discountType: 'percent', discountValue: 10 }).total).toBe(54_000);
  });

  it('明細金額を上回る割引は行わない', () => {
    expect(line({ discountType: 'amount', discountValue: 999_999 }).total).toBe(0);
    expect(line({ discountType: 'percent', discountValue: 500 }).total).toBe(0);
  });

  it('量り売りなどの小数数量を正しく計算する', () => {
    expect(line({ price: 165_000, qty: 0.35, cost: 0 }).gross).toBe(57_750);
  });

  it('原価を数量倍して整数へ丸める', () => {
    expect(line({ qty: 0.333, cost: 10_000 }).cost).toBe(3_330);
  });

  it('オプション込みの単価を取得できる', () => {
    expect(unitPriceOf({ price: 25_000, modifiers: [{ priceDelta: 10_000 }] })).toBe(35_000);
  });
});

describe('computeTotals 伝票合計計算', () => {
  it('明細の合計金額を集計する', () => {
    const result = totals({ items: [item(60_000), item(40_000)] });
    expect(result.subtotal).toBe(100_000);
    expect(result.total).toBe(100_000);
  });

  it('伝票全体のパーセント割引を適用する', () => {
    const result = totals({ discountType: 'percent', discountValue: 15 });
    expect(result.discount).toBe(15_000);
    expect(result.total).toBe(85_000);
  });

  it('伝票全体の定額割引を小計までに制限する', () => {
    expect(totals({ discountType: 'amount', discountValue: 500_000 }).total).toBe(0);
  });

  it('外税モードでは税額を上乗せする', () => {
    const result = totals({ taxMode: 'exclusive', taxRate: 10 });
    expect(result.tax).toBe(10_000);
    expect(result.total).toBe(110_000);
  });

  it('内税モードでは合計を変えずに内消費税を逆算する', () => {
    const result = totals({ taxMode: 'inclusive', taxRate: 10 });
    expect(result.total).toBe(100_000);
    expect(result.tax).toBe(9_091);
  });

  it('サービス料を加算した上で課税計算を行う', () => {
    const result = totals({ serviceChargeRate: 5, taxMode: 'exclusive', taxRate: 10 });
    expect(result.serviceCharge).toBe(5_000);
    expect(result.tax).toBe(10_500);
    expect(result.total).toBe(115_500);
  });

  it('請求合計を指定の端数単位へ丸める', () => {
    const result = totals({ items: [item(101_400)], roundTo: 1_000 });
    expect(result.total).toBe(101_000);
    expect(result.rounding).toBe(-400);
  });

  it('端数丸め前にポイント充当を差し引く', () => {
    const result = totals({ pointsUsed: 50, pointsValue: 100 });
    expect(result.pointsRedeemed).toBe(5_000);
    expect(result.total).toBe(95_000);
  });

  it('ポイント充当で合計が負数にならないようにする', () => {
    const result = totals({ pointsUsed: 99_999, pointsValue: 100 });
    expect(result.total).toBe(0);
  });

  it('税額と売上原価を差し引いた粗利を算出する', () => {
    const result = totals({ taxMode: 'exclusive', taxRate: 10 });
    expect(result.cogs).toBe(40_000);
    expect(result.profit).toBe(110_000 - 10_000 - 40_000);
  });

  it('小数数量を含む全明細の合計点数を集計する', () => {
    const result = totals({ items: [item(1, 0, 0.5), item(1, 0, 2)] });
    expect(result.unitCount).toBe(2.5);
    expect(result.itemCount).toBe(2);
  });
});

describe('カート計算補助関数', () => {
  it('預り金が請求額を上回るときのみお釣りを返す', () => {
    expect(changeFor(100_000, 200_000)).toBe(100_000);
    expect(changeFor(100_000, 50_000)).toBe(0);
  });

  it('付与単位を満たした分だけポイントを計算する', () => {
    expect(pointsEarnedFor(125_000, 10_000)).toBe(12);
    expect(pointsEarnedFor(125_000, 0)).toBe(0);
  });

  it('同一商品・同一オプションは順序に関係なく同一明細キーとみなす', () => {
    const a = lineKey('p1', [{ id: 'm1' }, { id: 'm2' }], '', 'none', 0);
    const b = lineKey('p1', [{ id: 'm2' }, { id: 'm1' }], '', 'none', 0);
    const c = lineKey('p1', [{ id: 'm1' }], '', 'none', 0);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('メモが異なる場合は別明細キーとして分ける', () => {
    expect(lineKey('p1', [], 'no ice', 'none', 0)).not.toBe(lineKey('p1', [], '', 'none', 0));
  });
});
