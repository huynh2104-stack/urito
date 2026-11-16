import type { DiscountType, OrderItem, OrderType, TaxLine, TaxMode, TaxRounding } from '@/db/types';
import { percentOf, roundToStep, normaliseQty } from './money';
import { computeTaxLines } from './tax';

/* The whole pricing engine lives here as pure functions so it can be unit
 * tested without a browser, a database or React. Every screen that shows a
 * price calls into this file - there is exactly one source of truth. */

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

/** Unit price including the picked modifiers (size L, extra shot, ...). */
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

/** Points earned by an order, e.g. 1 point per 10.000 d spent. */
export function pointsEarnedFor(total: number, earnPer: number): number {
  if (!earnPer || earnPer <= 0) return 0;
  return Math.floor(total / earnPer);
}

/** Change to hand back once the customer has paid. */
export function changeFor(total: number, paid: number): number {
  return Math.max(0, paid - total);
}

export function dueFor(total: number, paid: number): number {
  return Math.max(0, total - paid);
}

/** Two cart lines merge when they are the same product with the same options. */
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
