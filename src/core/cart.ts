import type { DiscountType, OrderItem, OrderType, TaxLine, TaxMode, TaxRounding } from '@/db/types';
import { percentOf, roundToStep, normaliseQty } from './money';
import { computeTaxLines } from './tax';

/* 価格・割引・税額計算の純粋関数エンジン。画面・DB・React から独立させ単体テスト可能にし、計算根拠を単一化する。 */

export interface LineInput {
  price: number;
  qty: number;
  cost: number;
  modifiers: { priceDelta: number }[];
  discountType: DiscountType;
  discountValue: number;
}

export interface LineTotals {
  unitPrice: number;
  gross: number;
  discount: number;
  total: number;
  cost: number;
}

/** 選択したオプション（Lサイズ・追加ショット等）を含めた単価を返す。 */
export function unitPriceOf(line: Pick<LineInput, 'price' | 'modifiers'>): number {
  return line.modifiers.reduce((sum, m) => sum + m.priceDelta, line.price);
}

export function computeLine(line: LineInput): LineTotals {
  const qty = normaliseQty(line.qty);
  const unitPrice = unitPriceOf(line);
  const gross = Math.round(unitPrice * qty);
  let discount = 0;
  if (line.discountType === 'percent') discount = percentOf(gross, line.discountValue);
  else if (line.discountType === 'amount') discount = Math.min(gross, Math.round(line.discountValue));
  discount = Math.min(Math.max(discount, 0), gross);
  return {
    unitPrice,
    gross,
    discount,
    total: gross - discount,
    cost: Math.round(line.cost * qty),
  };
}

export interface TotalsInput {
  items: Pick<OrderItem, 'total' | 'cost' | 'qty' | 'taxCategory' | 'taxRateBp'>[];
  discountType: DiscountType;
  discountValue: number;
  serviceChargeRate: number;
  taxMode: TaxMode;
  taxRate: number;
  taxRates?: { standard: number; reduced: number };
  taxRounding?: TaxRounding;
  orderType?: OrderType;
  eatInRule?: boolean;
  roundTo: number;
  /** 顧客が利用するポイント数と1ポイントあたりの換算額。 */
  pointsUsed?: number;
  pointsValue?: number;
}

export interface Totals {
  subtotal: number;
  discount: number;
  afterDiscount: number;
  serviceCharge: number;
  tax: number;
  taxLines: TaxLine[];
  pointsRedeemed: number;
  rounding: number;
  total: number;
  cogs: number;
  profit: number;
  itemCount: number;
  unitCount: number;
}

export function computeTotals(input: TotalsInput): Totals {
  const subtotal = input.items.reduce((s, i) => s + i.total, 0);
  const cogs = input.items.reduce((s, i) => s + i.cost, 0);

  let discount = 0;
  if (input.discountType === 'percent') discount = percentOf(subtotal, input.discountValue);
  else if (input.discountType === 'amount') discount = Math.round(input.discountValue);
  discount = Math.min(Math.max(discount, 0), subtotal);

  const afterDiscount = subtotal - discount;
  const serviceCharge = percentOf(afterDiscount, input.serviceChargeRate);
  const base = afterDiscount + serviceCharge;

  const { lines: taxLines, tax } = computeTaxLines({
    items: input.items,
    discount,
    serviceCharge,
    taxMode: input.taxMode,
    taxRate: input.taxRate,
    taxRates: input.taxRates,
    taxRounding: input.taxRounding,
    orderType: input.orderType,
    eatInRule: input.eatInRule,
  });

  const beforeRedeem = input.taxMode === 'exclusive' ? base + tax : base;

  const pointsRedeemed = Math.min(
    beforeRedeem,
    Math.max(0, Math.round((input.pointsUsed ?? 0) * (input.pointsValue ?? 0))),
  );
  const preRounding = beforeRedeem - pointsRedeemed;
  const total = roundToStep(preRounding, input.roundTo);
  const rounding = total - preRounding;

  return {
    subtotal,
    discount,
    afterDiscount,
    serviceCharge,
    tax,
    taxLines,
    pointsRedeemed,
    rounding,
    total,
    cogs,
    profit: total - tax - cogs,
    itemCount: input.items.length,
    unitCount: normaliseQty(input.items.reduce((s, i) => s + i.qty, 0)),
  };
}

/** 支払い額に応じて付与されるポイント数を返す（例: 10,000円ごと1pt）。 */
export function pointsEarnedFor(total: number, earnPer: number): number {
  if (!earnPer || earnPer <= 0) return 0;
  return Math.floor(total / earnPer);
}

/** 預り金から合計を差し引いたお釣りを返す。 */
export function changeFor(total: number, paid: number): number {
  return Math.max(0, paid - total);
}

export function dueFor(total: number, paid: number): number {
  return Math.max(0, total - paid);
}

/** 同一商品・同一オプション・同一メモの明細を統合するための識別キーを生成する。 */
export function lineKey(
  productId: string,
  modifiers: { id: string }[],
  note: string,
  discountType: DiscountType,
  discountValue: number,
): string {
  const mods = modifiers.map((m) => m.id).sort().join(',');
  return [productId, mods, note.trim(), discountType, discountValue].join('|');
}
