import { normaliseQty } from './money';
import type { Order, OrderItem } from '@/db/types';

/** 整数除算（四捨五入・半値切り上げ）を剰余 % を用いて浮動小数点なしで計算する。 */
function divRoundHalfUp(numer: number, denom: number): number {
  if (denom <= 0) return 0;
  const q = Math.trunc(numer / denom);
  const r = numer % denom;
  return r * 2 >= denom ? q + 1 : q;
}

/** 総額 totalAmount を重み配列 weights に従って最大剰余法で整数按分する。
 *  全要素の合計は必ず totalAmount と厳密に一致する。 */
export function allocateProportionally(totalAmount: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const total = Math.trunc(totalAmount);
  if (total === 0) return new Array<number>(n).fill(0);

  const safeWeights = weights.map((w) => Math.max(0, Math.trunc(w)));
  let weightSum = safeWeights.reduce((s, w) => s + w, 0);
  const effectiveWeights = weightSum > 0 ? safeWeights : new Array<number>(n).fill(1);
  if (weightSum <= 0) weightSum = n;

  const sign = total < 0 ? -1 : 1;
  const absTotal = Math.abs(total);
  const quotients = new Array<number>(n).fill(0);
  const remainders: { idx: number; rem: number }[] = [];

  let distributed = 0;
  for (let i = 0; i < n; i++) {
    const numer = absTotal * effectiveWeights[i];
    const q = Math.trunc(numer / weightSum);
    const rem = numer % weightSum;
    quotients[i] = q;
    distributed += q;
    remainders.push({ idx: i, rem });
  }

  const leftover = absTotal - distributed;
  remainders.sort((a, b) => b.rem - a.rem || a.idx - b.idx);
  for (let k = 0; k < leftover; k++) {
    quotients[remainders[k].idx] += 1;
  }

  return quotients.map((q) => (q === 0 ? 0 : sign * q));
}

/** 各明細の「実収額に対する按分額」を算出する（全明細の合計 === order.total）。 */
export function allocateLineNets(order: Pick<Order, 'items' | 'total'>): Map<string, number> {
  const weights = order.items.map((item) =>
    item.total > 0 ? item.total : Math.max(0, Math.round(item.qty * 1000)),
  );
  const alloc = allocateProportionally(Math.max(0, order.total), weights);
  const map = new Map<string, number>();
  order.items.forEach((item, idx) => {
    map.set(item.id, alloc[idx] ?? 0);
  });
  return map;
}

function refundedAmountForItem(order: Pick<Order, 'refunds'>, item: OrderItem, lineNet: number): number {
  let fromLog = 0;
  let hasEntry = false;
  for (const r of order.refunds ?? []) {
    for (const ri of r.items) {
      if (ri.itemId === item.id) {
        fromLog += ri.amount;
        hasEntry = true;
      }
    }
  }
  if (hasEntry) return fromLog;
  if (item.refundedQty <= 0 || item.qty <= 0) return 0;
  const totalMilli = Math.round(item.qty * 1000);
  const refMilli = Math.round(item.refundedQty * 1000);
  return divRoundHalfUp(lineNet * refMilli, totalMilli);
}

/** 1明細・指定数量の返金額を算出する（複数回に分割返金しても合計が実収額を超えない）。 */
export function refundAmountFor(order: Pick<Order, 'items' | 'total' | 'refundedAmount' | 'refunds'>, item: OrderItem, qty: number): number {
  if (item.qty <= 0 || qty <= 0) return 0;
  const remainingOrder = Math.max(0, order.total - order.refundedAmount);
  if (remainingOrder <= 0) return 0;

  const lineNets = allocateLineNets(order);
  const lineNet = lineNets.get(item.id) ?? 0;
  const alreadyLine = refundedAmountForItem(order, item, lineNet);
  const remainingLineAmount = Math.max(0, lineNet - alreadyLine);
  const remainingQty = normaliseQty(item.qty - item.refundedQty);
  if (remainingQty <= 0 || remainingLineAmount <= 0) return 0;

  const targetQty = Math.min(normaliseQty(qty), remainingQty);
  let raw: number;
  if (targetQty >= remainingQty) {
    raw = remainingLineAmount;
  } else {
    const qtyMilli = Math.round(targetQty * 1000);
    const totalMilli = Math.round(item.qty * 1000);
    raw = Math.min(remainingLineAmount, divRoundHalfUp(lineNet * qtyMilli, totalMilli));
  }
  return Math.max(0, Math.min(raw, remainingOrder));
}

export interface RefundLineInput {
  itemId: string;
  qty: number;
}

export interface ComputedRefund {
  items: { itemId: string; qty: number; amount: number }[];
  totalAmount: number;
}

/** 複数明細の返金額をまとめて計算し、注文の未返金残高で上限を厳格に制限する。 */
export function computeOrderRefund(
  order: Pick<Order, 'items' | 'total' | 'refundedAmount' | 'refunds'>,
  lines: RefundLineInput[],
): ComputedRefund {
  let remainingOrder = Math.max(0, order.total - order.refundedAmount);
  const lineNets = allocateLineNets(order);
  const items: { itemId: string; qty: number; amount: number }[] = [];
  let totalAmount = 0;

  for (const item of order.items) {
    const line = lines.find((l) => l.itemId === item.id);
    if (!line || line.qty <= 0 || remainingOrder <= 0) continue;
    const remainingQty = normaliseQty(item.qty - item.refundedQty);
    const qty = Math.min(normaliseQty(line.qty), remainingQty);
    if (qty <= 0) continue;

    const lineNet = lineNets.get(item.id) ?? 0;
    const alreadyLine = refundedAmountForItem(order, item, lineNet);
    const remainingLineAmount = Math.max(0, lineNet - alreadyLine);
    let amount: number;
    if (qty >= remainingQty) {
      amount = remainingLineAmount;
    } else {
      const qtyMilli = Math.round(qty * 1000);
      const totalMilli = Math.round(item.qty * 1000);
      amount = Math.min(remainingLineAmount, divRoundHalfUp(lineNet * qtyMilli, totalMilli));
    }
    amount = Math.max(0, Math.min(amount, remainingOrder));
    remainingOrder -= amount;
    totalAmount += amount;
    items.push({ itemId: item.id, qty, amount });
  }

  return { items, totalAmount };
}
