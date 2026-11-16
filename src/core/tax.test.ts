import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeTaxLines, divCeil, divFloor, divRound, effectiveTaxRateBp } from './tax';
import type { OrderType, TaxCategory, TaxMode, TaxRounding } from '@/db/types';

describe('複数税率・整数除算エンジン (D-01)', () => {
  it('整数除算の切り捨て・四捨五入・切り上げが浮動小数点なしで正確', () => {
    expect(divFloor(1099, 100)).toBe(10);
    expect(divRound(1049, 100)).toBe(10);
    expect(divRound(1050, 100)).toBe(11);
    expect(divCeil(1001, 100)).toBe(11);
    expect(divCeil(1000, 100)).toBe(10);
  });

  it('8%と10%が混在する内税注文で税率ごとに1回ずつ税額を算出する', () => {
    const res = computeTaxLines({
      items: [
        { total: 1080, taxCategory: 'reduced' },
        { total: 1100, taxCategory: 'standard' },
      ],
      discount: 0,
      serviceCharge: 0,
      taxMode: 'inclusive',
      taxRate: 10,
      taxRates: { standard: 1000, reduced: 800 },
      taxRounding: 'floor',
      orderType: 'retail',
      eatInRule: false,
    });
    expect(res.lines).toEqual([
      { rateBp: 1000, gross: 1100, net: 1000, tax: 100 },
      { rateBp: 800, gross: 1080, net: 1000, tax: 80 },
    ]);
    expect(res.tax).toBe(180);
  });

  it('イートイン規則が有効な場合、軽減税率商品は店内飲食(dine_in)で標準税率10%になる', () => {
    const settings = {
      taxMode: 'inclusive' as const,
      taxRate: 10,
      taxRates: { standard: 1000, reduced: 800 },
      eatInRule: true,
    };
    expect(effectiveTaxRateBp('reduced', 'takeaway', settings)).toBe(800);
    expect(effectiveTaxRateBp('reduced', 'dine_in', settings)).toBe(1000);
    expect(effectiveTaxRateBp('exempt', 'dine_in', settings)).toBe(0);
  });

  it('プロパティテスト：税区分のgross合計は対象総額と一致し、明細順序を入れ替えても不変', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            total: fc.integer({ min: 1, max: 50_000 }),
            taxCategory: fc.constantFrom<TaxCategory>('standard', 'reduced', 'exempt'),
          }),
          { minLength: 1, maxLength: 12 },
        ),
        fc.integer({ min: 0, max: 5_000 }),
        fc.integer({ min: 0, max: 2_000 }),
        fc.constantFrom<TaxMode>('inclusive', 'exclusive'),
        fc.constantFrom<TaxRounding>('floor', 'round', 'ceil'),
        fc.constantFrom<OrderType>('retail', 'dine_in', 'takeaway'),
        fc.boolean(),
        (items, rawDiscount, serviceCharge, taxMode, taxRounding, orderType, eatInRule) => {
          const subtotal = items.reduce((s, i) => s + i.total, 0);
          const discount = Math.min(rawDiscount, subtotal);
          const baseInput = {
            items,
            discount,
            serviceCharge,
            taxMode,
            taxRate: 10,
            taxRates: { standard: 1000, reduced: 800 },
            taxRounding,
            orderType,
            eatInRule,
          };

          const res = computeTaxLines(baseInput);
          const reversed = computeTaxLines({ ...baseInput, items: [...items].reverse() });

          // 明細順序を変更しても税額・行構成は同一
          expect(reversed).toEqual(res);

          // 税行合計の検証
          const grossSum = res.lines.reduce((s, l) => s + l.gross, 0);
          const netSum = res.lines.reduce((s, l) => s + l.net, 0);
          const expectedBase = subtotal - discount + serviceCharge;
          if (taxMode === 'inclusive') {
            expect(grossSum).toBe(expectedBase);
            expect(netSum + res.tax).toBe(grossSum);
          } else {
            expect(netSum).toBe(expectedBase);
            expect(grossSum).toBe(expectedBase + res.tax);
          }

          // 各税区分について厳密値からの誤差が1未満であること
          for (const line of res.lines) {
            if (line.rateBp === 0) {
              expect(line.tax).toBe(0);
            } else {
              const exact =
                taxMode === 'inclusive'
                  ? (line.gross * line.rateBp) / (10000 + line.rateBp)
                  : (line.net * line.rateBp) / 10000;
              expect(Math.abs(line.tax - exact)).toBeLessThanOrEqual(1);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
