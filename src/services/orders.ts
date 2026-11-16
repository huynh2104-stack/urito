import { db } from '@/db/db';
import { getDeviceNo, nextSeq } from '@/db/seq';
import { formatCode, newId } from '@/core/id';
import { pointsEarnedFor } from '@/core/cart';
import { computeOrderRefund, refundAmountFor as coreRefundAmountFor } from '@/core/refund';
import { divRound, effectiveTaxRateBp } from '@/core/tax';
import { normaliseQty } from '@/core/money';
import { reservedByOpenOrders } from '@/lib/useReserved';
import { cartTotals, type CartState } from '@/store/cart';
import { applyStockChanges } from './inventory';
import { applyOrderRollupDelta } from './rollups';
import type { Order, OrderItem, Payment, Refund, Settings, User } from '@/db/types';

export interface OrderContext {
  user: User | null;
  settings: Settings;
  shiftId: string | null;
}

const orderTables = () => [
  db.orders,
  db.products,
  db.stockMovements,
  db.settings,
  db.customers,
  db.kv,
  db.promotions,
  db.dailyStats,
  db.dailyProductStats,
];

function baseOrder(cart: CartState, ctx: OrderContext): Order {
  const totals = cartTotals(cart, ctx.settings);
  const now = Date.now();
  return {
    id: cart.orderId ?? newId('o'),
    code: cart.orderCode,
    type: cart.type,
    status: 'open',
    tableId: cart.tableId,
    tableName: cart.tableName,
    guests: cart.guests,
    customerId: cart.customerId,
    customerName: cart.customerName,
    items: cart.items.map((i) => ({
      ...i,
      taxRateBp: effectiveTaxRateBp(i.taxCategory, cart.type, ctx.settings),
    })),
    subtotal: totals.subtotal,
    discountType: cart.discountType,
    discountValue: cart.discountValue,
    discount: totals.discount,
    serviceCharge: totals.serviceCharge,
    taxMode: ctx.settings.taxMode,
    taxRate: ctx.settings.taxRate,
    tax: totals.tax,
    taxLines: totals.taxLines,
    rounding: totals.rounding,
    total: totals.total,
    cogs: totals.cogs,
    paidAmount: 0,
    changeAmount: 0,
    dueAmount: totals.total,
    payments: [],
    refunds: [],
    refundedAmount: 0,
    pointsEarned: 0,
    pointsUsed: ctx.settings.loyaltyEnabled ? cart.pointsUsed : 0,
    pointsValue: totals.pointsRedeemed,
    note: cart.note,
    userId: ctx.user?.id ?? '',
    userName: ctx.user?.name ?? '',
    shiftId: ctx.shiftId,
    createdAt: cart.createdAt || now,
    updatedAt: now,
    paidAt: 0,
    voidedAt: 0,
    voidReason: '',
  };
}

export { reservedByOpenOrders };

export class StockError extends Error {
  constructor(
    public productName: string,
    public available: number,
  ) {
    super(`Not enough stock: ${productName}`);
  }
}

/** B-08: 掛売(allowDebt)が許可されていないにもかかわらず支払額が合計に満たない場合のエラー。 */
export class PaymentShortfallError extends Error {
  constructor(
    public total: number,
    public paid: number,
  ) {
    super(`Payment shortfall: ${paid} < ${total}`);
  }
}

/** Parks the current cart as an open ticket (a held order or a live table). */
export async function holdOrder(cart: CartState, ctx: OrderContext): Promise<Order> {
  const order = baseOrder(cart, ctx);
  await db.transaction('rw', [db.orders, db.dailyStats, db.dailyProductStats, db.kv], async () => {
    const prev = cart.orderId ? ((await db.orders.get(cart.orderId)) ?? null) : null;
    const prevOrder = cart.orderId ? ((await db.orders.get(cart.orderId)) ?? null) : null;
    await db.orders.put(order);
    await applyOrderRollupDelta(prevOrder, order);
    await applyOrderRollupDelta(prev, order);
    await db.kv.delete('cart.draft');
  });
  return order;
}

export interface PayInput {
  cart: CartState;
  ctx: OrderContext;
  payments: { method: Payment['method']; amount: number; ref?: string }[];
  /** Put the unpaid remainder on the customer's account. */
  allowDebt: boolean;
}

/** Finalises a sale: assigns the invoice number, moves stock, updates the
 *  customer's points and debt - all inside one transaction. */
export async function payOrder(input: PayInput): Promise<Order> {
  const { cart, ctx } = input;
  return db.transaction('rw', orderTables(), async () => {
    const settings = (await db.settings.get('app')) ?? ctx.settings;
    const now = Date.now();
    const order = baseOrder(cart, { ...ctx, settings });

    // The cart screen already warns, but stock can change underneath it (another
    // ticket paid, a reopened held order), so the till re-checks at the last moment.
    if (!settings.negativeStock) {
      const reserved = await reservedByOpenOrders(order.id);
      const wanted = new Map<string, number>();
      for (const i of order.items) wanted.set(i.productId, (wanted.get(i.productId) ?? 0) + i.qty);
      for (const [productId, qty] of wanted) {
        const product = await db.products.get(productId);
        if (!product || !product.trackStock || product.isService) continue;
        const available = Math.max(0, normaliseQty(product.stock - (reserved.get(productId) ?? 0)));
        if (qty > available) throw new StockError(product.name, available);
      }
    }

    const seq = await nextSeq('order');
    const deviceNo = await getDeviceNo();
    order.code = formatCode(settings.orderPrefix, seq, new Date(now), deviceNo);

    const payments: Payment[] = input.payments
      .filter((p) => p.amount > 0)
      .map((p) => ({ id: newId('pm'), method: p.method, amount: Math.round(p.amount), ref: p.ref ?? '', at: now }));

    const paidAmount = payments.reduce((s, p) => s + p.amount, 0);
    const changeAmount = Math.max(0, paidAmount - order.total);
    const dueAmount = Math.max(0, order.total - paidAmount);
    if (paidAmount < order.total && !input.allowDebt) {
      throw new PaymentShortfallError(order.total, paidAmount);
    }

    order.payments = payments;
    order.paidAmount = paidAmount;
    order.changeAmount = changeAmount;
    order.dueAmount = input.allowDebt ? dueAmount : 0;
    order.status = 'paid';
    order.paidAt = now;
    order.updatedAt = now;
    order.pointsEarned = settings.loyaltyEnabled
      ? pointsEarnedFor(order.total, settings.loyaltyEarnPer)
      : 0;

    const prevOrder = cart.orderId ? ((await db.orders.get(cart.orderId)) ?? null) : null;
    await db.orders.put(order);
    await applyOrderRollupDelta(prevOrder, order);

    await applyStockChanges(
      order.items.map((i) => ({
        productId: i.productId,
        delta: -i.qty,
        type: 'sale' as const,
        cost: i.cost,
        refType: 'order',
        refId: order.id,
        note: order.code,
      })),
      ctx.user,
    );

    if (order.customerId) {
      const customer = await db.customers.get(order.customerId);
      if (customer) {
        await db.customers.put({
          ...customer,
          points: Math.max(0, customer.points - order.pointsUsed + order.pointsEarned),
          debt: customer.debt + order.dueAmount,
          totalSpent: customer.totalSpent + order.total,
          orderCount: customer.orderCount + 1,
          updatedAt: now,
        });
      }
    }

    if (cart.promotionId) {
      const promo = await db.promotions.get(cart.promotionId);
      if (promo) {
        await db.promotions.update(promo.id, { usageCount: promo.usageCount + 1 });
      }
    }
    await db.kv.delete('cart.draft');

    return order;
  });
}

/** 支払済み伝票を取消す：在庫・顧客ポイント・売掛金を戻し、現在シフトに全額返金仕訳を記録する。 */
export async function voidOrder(
  order: Order,
  reason: string,
  user: User | null,
  currentShiftId: string | null = null,
): Promise<void> {
  await db.transaction('rw', orderTables(), async () => {
    const now = Date.now();
    const fresh = await db.orders.get(order.id);
    if (!fresh || fresh.status === 'void') return;

    const wasPaid = fresh.status === 'paid' || fresh.status === 'refunded';
    const remAmount = wasPaid ? Math.max(0, fresh.total - fresh.refundedAmount) : 0;
    const refunds = [...fresh.refunds];
    let nextDueAmount = fresh.dueAmount;

    if (wasPaid && remAmount > 0) {
      const debtOffset = Math.min(fresh.dueAmount, remAmount);
      nextDueAmount = Math.max(0, fresh.dueAmount - debtOffset);
      const method = fresh.payments.find((p) => p.method === 'cash')?.method ?? fresh.payments[0]?.method ?? 'cash';
      const remainingItems = fresh.items
        .map((i) => ({ itemId: i.id, qty: normaliseQty(i.qty - i.refundedQty), amount: 0 }))
        .filter((i) => i.qty > 0);
      refunds.push({
        id: newId('rf'),
        at: now,
        amount: remAmount,
        debtOffset,
        reason,
        method,
        userId: user?.id ?? '',
        shiftId: currentShiftId,
        items: remainingItems,
        restock: true,
      });
    }

    const updatedOrder: Order = {
      ...fresh,
      status: 'void',
      refunds,
      refundedAmount: wasPaid ? fresh.total : fresh.refundedAmount,
      dueAmount: nextDueAmount,
      voidedAt: now,
      voidReason: reason,
      updatedAt: now,
    };
    await db.orders.put(updatedOrder);
    await applyOrderRollupDelta(fresh, updatedOrder);

    if (wasPaid) {
      await applyStockChanges(
        fresh.items.map((i) => ({
          productId: i.productId,
          delta: normaliseQty(i.qty - i.refundedQty),
          type: 'return' as const,
          cost: i.cost,
          refType: 'void',
          refId: fresh.id,
          note: reason,
        })),
        user,
      );

      if (fresh.customerId) {
        const customer = await db.customers.get(fresh.customerId);
        if (customer) {
          const alreadyRefunded = fresh.refundedAmount;
          const prevEarnedReversed = fresh.total > 0 ? divRound(fresh.pointsEarned * alreadyRefunded, fresh.total) : 0;
          const prevUsedReturned = fresh.total > 0 ? divRound(fresh.pointsUsed * alreadyRefunded, fresh.total) : 0;
          const earnedToDeduct = Math.max(0, fresh.pointsEarned - prevEarnedReversed);
          const usedToReturn = Math.max(0, fresh.pointsUsed - prevUsedReturned);
          const debtToClear = Math.min(customer.debt, fresh.dueAmount);
          await db.customers.put({
            ...customer,
            points: Math.max(0, customer.points - earnedToDeduct + usedToReturn),
            debt: Math.max(0, customer.debt - debtToClear),
            totalSpent: Math.max(0, customer.totalSpent - remAmount),
            orderCount: Math.max(0, customer.orderCount - 1),
            updatedAt: now,
          });
        }
      }
    }
  });
}

export interface RefundLine {
  itemId: string;
  qty: number;
}

export interface RefundInput {
  order: Order;
  lines: RefundLine[];
  reason: string;
  method: Payment['method'];
  restock: boolean;
  user: User | null;
  shiftId?: string | null;
}

/** 1明細の返金額を算出する（注文レベルの割引・端数・ポイント・外税を考慮）。 */
export function refundAmountFor(order: Order, item: OrderItem, qty: number): number {
  return coreRefundAmountFor(order, item, qty);
}

export async function refundOrder(input: RefundInput): Promise<number> {
  const { order, lines, user } = input;
  return db.transaction('rw', orderTables(), async () => {
    const fresh = await db.orders.get(order.id);
    if (!fresh) return 0;
    const now = Date.now();

    const computed = computeOrderRefund(fresh, lines);
    if (!computed.items.length) return 0;
    const amount = computed.totalAmount;
    const refundItems = computed.items;
    const qtyById = new Map(refundItems.map((r) => [r.itemId, r.qty]));
    const items = fresh.items.map((item) => {
      const q = qtyById.get(item.id);
      return q ? { ...item, refundedQty: normaliseQty(item.refundedQty + q) } : item;
    });

    const debtOffset = Math.min(fresh.dueAmount, amount);
    const refund: Refund = {
      id: newId('rf'),
      at: now,
      amount,
      debtOffset,
      reason: input.reason,
      method: input.method,
      userId: user?.id ?? '',
      shiftId: input.shiftId ?? null,
      items: refundItems,
      restock: input.restock,
    };

    const fullyRefunded = items.every((i) => i.refundedQty >= i.qty);
    const updatedOrder: Order = {
      ...fresh,
      items,
      refunds: [...fresh.refunds, refund],
      refundedAmount: fresh.refundedAmount + amount,
      dueAmount: Math.max(0, fresh.dueAmount - debtOffset),
      status: fullyRefunded ? 'refunded' : fresh.status,
      updatedAt: now,
    };
    await db.orders.put(updatedOrder);
    await applyOrderRollupDelta(fresh, updatedOrder);

    if (input.restock) {
      await applyStockChanges(
        refundItems.map((r) => {
          const item = fresh.items.find((i) => i.id === r.itemId)!;
          return {
            productId: item.productId,
            delta: r.qty,
            type: 'return' as const,
            cost: item.cost,
            refType: 'refund',
            refId: fresh.id,
            note: input.reason,
          };
        }),
        user,
      );
    }

    if (fresh.customerId) {
      const customer = await db.customers.get(fresh.customerId);
      if (customer) {
        const earnedToDeduct =
          fresh.total > 0
            ? fullyRefunded
              ? Math.max(0, fresh.pointsEarned - divRound(fresh.pointsEarned * fresh.refundedAmount, fresh.total))
              : divRound(fresh.pointsEarned * amount, fresh.total)
            : 0;
        const usedToReturn =
          fresh.total > 0
            ? fullyRefunded
              ? Math.max(0, fresh.pointsUsed - divRound(fresh.pointsUsed * fresh.refundedAmount, fresh.total))
              : divRound(fresh.pointsUsed * amount, fresh.total)
            : 0;
        const debtToClear = Math.min(customer.debt, debtOffset);
        await db.customers.put({
          ...customer,
          points: Math.max(0, customer.points - earnedToDeduct + usedToReturn),
          debt: Math.max(0, customer.debt - debtToClear),
          totalSpent: Math.max(0, customer.totalSpent - amount),
          updatedAt: now,
        });
      }
    }

    return amount;
  });
}

export async function deleteOpenOrder(orderId: string): Promise<void> {
  const order = await db.orders.get(orderId);
  if (order && order.status === 'open') await db.orders.delete(orderId);
}

/** Live tickets: held retail orders and tables currently being served. */
export async function listOpenOrders(): Promise<Order[]> {
  const rows = await db.orders.where('status').equals('open').toArray();
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function findOpenOrderForTable(tableId: string): Promise<Order | undefined> {
  return db.orders.where('[status+tableId]').equals(['open', tableId]).first();
}

/** Net value of an order once refunds are taken off. */
export function netTotal(order: Order): number {
  return order.status === 'void' ? 0 : order.total - order.refundedAmount;
}
