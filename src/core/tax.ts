import type { Order, OrderType, TaxCategory, TaxLine, TaxMode, TaxRounding } from '@/db/types';

/** 整数除算：切り捨て（非負整数向け）。 */
export function divFloor(numer: number, denom: number): number {
  if (denom <= 0) return 0;
  return Math.trunc(numer / denom);
}

/** 整数除算：四捨五入（剰余 % を用いた半値切り上げ）。 */
export function divRound(numer: number, denom: number): number {
  if (denom <= 0) return 0;
  const q = Math.trunc(numer / denom);
  const r = numer % denom;
  return r * 2 >= denom ? q + 1 : q;
}

/** 整数除算：切り上げ（剰余 % が正なら +1）。 */
export function divCeil(numer: number, denom: number): number {
  if (denom <= 0) return 0;
  const q = Math.trunc(numer / denom);
  const r = numer % denom;
  return r > 0 ? q + 1 : q;
}

export function divWithRounding(numer: number, denom: number, rounding: TaxRounding): number {
  if (numer <= 0 || denom <= 0) return 0;
  if (rounding === 'floor') return divFloor(numer, denom);
  if (rounding === 'ceil') return divCeil(numer, denom);
  return divRound(numer, denom);
}

export interface TaxSettingsSlice {
  taxMode: TaxMode;
  taxRate: number;
  taxRates?: { standard: number; reduced: number };
  taxRounding?: TaxRounding;
  eatInRule?: boolean;
}

/** 明細の税区分・注文種別（イートイン/テイクアウト）・店舗設定から適用税率（bp）を返す。 */
export function effectiveTaxRateBp(
  category: TaxCategory | undefined,
  orderType: OrderType,
  settings: TaxSettingsSlice,
): number {
  if (settings.taxMode === 'none' || category === 'exempt') return 0;
  const standardBp = settings.taxRates?.standard ?? Math.round((settings.taxRate || 0) * 100);
  const reducedBp = settings.taxRates?.reduced ?? standardBp;
  if (category === 'reduced') {
    return settings.eatInRule && orderType === 'dine_in' ? standardBp : reducedBp;
  }
  return standardBp;
}

export interface TaxItemInput {
  total: number;
  taxCategory?: TaxCategory;
  taxRateBp?: number;
}

export interface ComputeTaxLinesInput {
  items: TaxItemInput[];
  discount: number;
  serviceCharge: number;
  taxMode: TaxMode;
  taxRate: number;
  taxRates?: { standard: number; reduced: number };
  taxRounding?: TaxRounding;
  orderType?: OrderType;
  eatInRule?: boolean;
}

/** 軽減税率対応の複数税率計算エンジン。
 *  1. 各明細の適用税率（bp）ごとに金額を合算する
 *  2. 伝票割引を税率グループ別に最大剰余法で按分する（同余時は高税率優先で決定論的）
 *  3. サービス料は標準税率グループへ加算する
 *  4. 税率グループ単位で1回だけ整数除算により消費税を算出する */
export function computeTaxLines(input: ComputeTaxLinesInput): { lines: TaxLine[]; tax: number } {
  if (input.taxMode === 'none') {
    return { lines: [], tax: 0 };
  }

  const orderType = input.orderType ?? 'retail';
  const rounding: TaxRounding = input.taxRounding ?? 'round';
  const standardBp = input.taxRates?.standard ?? Math.round((input.taxRate || 0) * 100);
  const settingsSlice: TaxSettingsSlice = {
    taxMode: input.taxMode,
    taxRate: input.taxRate,
    taxRates: input.taxRates,
    taxRounding: rounding,
    eatInRule: input.eatInRule,
  };

  const groups = new Map<number, number>();
  for (const item of input.items) {
    const bp = item.taxRateBp ?? effectiveTaxRateBp(item.taxCategory, orderType, settingsSlice);
    groups.set(bp, (groups.get(bp) ?? 0) + Math.trunc(item.total));
  }

  // サービス料に先立ち、割引前商品小計で割引を最大剰余法按分する
  const rateKeys = [...groups.keys()].sort((a, b) => b - a);
  const subtotal = rateKeys.reduce((s, bp) => s + (groups.get(bp) ?? 0), 0);
  const orderDiscount = Math.min(Math.max(0, Math.trunc(input.discount)), Math.max(0, subtotal));

  const postDiscount = new Map<number, number>();
  if (orderDiscount > 0 && subtotal > 0 && rateKeys.length > 0) {
    let distributed = 0;
    const rows = rateKeys.map((bp) => {
      const amount = groups.get(bp) ?? 0;
      const numer = orderDiscount * amount;
      const q = Math.trunc(numer / subtotal);
      const rem = numer % subtotal;
      distributed += q;
      return { bp, amount, q, rem };
    });
    const leftover = orderDiscount - distributed;
    const byRem = [...rows].sort((a, b) => b.rem - a.rem || b.bp - a.bp);
    for (let i = 0; i < leftover; i++) {
      byRem[i].q += 1;
    }
    for (const r of rows) {
      postDiscount.set(r.bp, Math.max(0, r.amount - r.q));
    }
  } else {
    for (const bp of rateKeys) {
      postDiscount.set(bp, groups.get(bp) ?? 0);
    }
  }

  // サービス料は標準税率区分へ算入する
  const service = Math.max(0, Math.trunc(input.serviceCharge));
  if (service > 0) {
    postDiscount.set(standardBp, (postDiscount.get(standardBp) ?? 0) + service);
  }

  const finalRates = [...postDiscount.keys()].sort((a, b) => b - a);
  const lines: TaxLine[] = [];
  let totalTax = 0;

  for (const rateBp of finalRates) {
    const base = postDiscount.get(rateBp) ?? 0;
    if (base <= 0) continue;
    if (input.taxMode === 'inclusive') {
      const tax = rateBp > 0 ? divWithRounding(base * rateBp, 10000 + rateBp, rounding) : 0;
      lines.push({ rateBp, gross: base, net: base - tax, tax });
      totalTax += tax;
    } else {
      const tax = rateBp > 0 ? divWithRounding(base * rateBp, 10000, rounding) : 0;
      lines.push({ rateBp, gross: base + tax, net: base, tax });
      totalTax += tax;
    }
  }

  return { lines, tax: totalTax };
}

/** 既存の単一税率伝票（taxLines 未保存）の表示用フォールバック行を返す。DBは書き換えない。 */
export function orderTaxLinesForDisplay(
  order: Pick<Order, 'taxLines' | 'taxMode' | 'taxRate' | 'tax' | 'subtotal' | 'discount' | 'serviceCharge'>,
): TaxLine[] {
  if (order.taxLines && order.taxLines.length > 0) return order.taxLines;
  if (order.taxMode === 'none' || order.tax <= 0) return [];
  const base = Math.max(0, order.subtotal - order.discount + order.serviceCharge);
  const rateBp = Math.round((order.taxRate || 0) * 100);
  if (order.taxMode === 'inclusive') {
    return [{ rateBp, gross: base, net: base - order.tax, tax: order.tax }];
  }
  return [{ rateBp, gross: base + order.tax, net: base, tax: order.tax }];
}
