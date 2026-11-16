import { dayKey, eachDay } from '@/core/date';
import type { Expense, Order, Product } from '@/db/types';

export interface SalesSummary {
  revenue: number;
  refunds: number;
  netRevenue: number;
  orderCount: number;
  avgOrder: number;
  cogs: number;
  grossProfit: number;
  discount: number;
  tax: number;
  serviceCharge: number;
  itemsSold: number;
  expenses: number;
  netProfit: number;
  voidCount: number;
}

/** Only paid / refunded invoices count as sales; open tickets and voids never do. */
export function sellableOrders(orders: Order[]): Order[] {
  return orders.filter((o) => o.status === 'paid' || o.status === 'refunded');
}

export function summarise(orders: Order[], expenses: Expense[] = []): SalesSummary {
  const sold = sellableOrders(orders);
  const revenue = sold.reduce((s, o) => s + o.total, 0);
  const refunds = sold.reduce((s, o) => s + o.refundedAmount, 0);
  const netRevenue = revenue - refunds;
  const cogs = sold.reduce((s, o) => s + effectiveCogs(o), 0);
  const tax = sold.reduce((s, o) => s + o.tax, 0);
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const grossProfit = netRevenue - tax - cogs;
  return {
    revenue,
    refunds,
    netRevenue,
    orderCount: sold.length,
    avgOrder: sold.length ? Math.round(netRevenue / sold.length) : 0,
    cogs,
    grossProfit,
    discount: sold.reduce((s, o) => s + o.discount + o.items.reduce((x, i) => x + i.discount, 0), 0),
    tax,
    serviceCharge: sold.reduce((s, o) => s + o.serviceCharge, 0),
    itemsSold: sold.reduce((s, o) => s + o.items.reduce((x, i) => x + (i.qty - i.refundedQty), 0), 0),
    expenses: expenseTotal,
    netProfit: grossProfit - expenseTotal,
    voidCount: orders.filter((o) => o.status === 'void').length,
  };
}

/** Cost of what the customer actually kept. */
export function effectiveCogs(order: Order): number {
  return order.items.reduce((s, i) => {
    const kept = Math.max(0, i.qty - i.refundedQty);
    return s + Math.round(i.cost * kept);
  }, 0);
}

export function netOrderTotal(order: Order): number {
  return order.total - order.refundedAmount;
}

export interface SeriesPoint {
  key: string;
  label: string;
  value: number;
  secondary?: number;
}

export function revenueByDay(orders: Order[], from: number, to: number): SeriesPoint[] {
  const sold = sellableOrders(orders);
  const buckets = new Map<string, number>();
  const profit = new Map<string, number>();
  for (const o of sold) {
    const k = dayKey(o.paidAt || o.createdAt);
    buckets.set(k, (buckets.get(k) ?? 0) + netOrderTotal(o));
    profit.set(k, (profit.get(k) ?? 0) + (netOrderTotal(o) - o.tax - effectiveCogs(o)));
  }
  return eachDay(from, to).map((ts) => {
    const k = dayKey(ts);
    const d = new Date(ts);
    return {
      key: k,
      label: `${d.getDate()}/${d.getMonth() + 1}`,
      value: buckets.get(k) ?? 0,
      secondary: profit.get(k) ?? 0,
    };
  });
}

export function revenueByHour(orders: Order[]): SeriesPoint[] {
  const sold = sellableOrders(orders);
  const buckets = new Array<number>(24).fill(0);
  const counts = new Array<number>(24).fill(0);
  for (const o of sold) {
    const h = new Date(o.paidAt || o.createdAt).getHours();
    buckets[h] += netOrderTotal(o);
    counts[h] += 1;
  }
  return buckets.map((value, h) => ({
    key: String(h),
    label: `${String(h).padStart(2, '0')}h`,
    value,
    secondary: counts[h],
  }));
}

export interface ProductStat {
  productId: string;
  name: string;
  qty: number;
  revenue: number;
  profit: number;
}

export function productStats(orders: Order[]): ProductStat[] {
  const map = new Map<string, ProductStat>();
  for (const o of sellableOrders(orders)) {
    for (const i of o.items) {
      const qty = Math.max(0, i.qty - i.refundedQty);
      if (qty <= 0) continue;
      const revenue = Math.round((i.total * qty) / (i.qty || 1));
      const cost = Math.round(i.cost * qty);
      const row = map.get(i.productId) ?? {
        productId: i.productId,
        name: i.name,
        qty: 0,
        revenue: 0,
        profit: 0,
      };
      row.qty += qty;
      row.revenue += revenue;
      row.profit += revenue - cost;
      map.set(i.productId, row);
    }
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

export interface NamedStat {
  key: string;
  name: string;
  value: number;
  count: number;
}

export function categoryStats(orders: Order[], products: Product[]): NamedStat[] {
  const catOf = new Map(products.map((p) => [p.id, p.categoryId]));
  const map = new Map<string, NamedStat>();
  for (const stat of productStats(orders)) {
    const key = catOf.get(stat.productId) ?? '';
    const row = map.get(key) ?? { key, name: '', value: 0, count: 0 };
    row.value += stat.revenue;
    row.count += stat.qty;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

export function paymentStats(orders: Order[]): NamedStat[] {
  const map = new Map<string, NamedStat>();
  for (const o of sellableOrders(orders)) {
    for (const p of o.payments) {
      const row = map.get(p.method) ?? { key: p.method, name: p.method, value: 0, count: 0 };
      row.value += p.amount;
      row.count += 1;
      map.set(p.method, row);
    }
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

export function employeeStats(orders: Order[]): NamedStat[] {
  const map = new Map<string, NamedStat>();
  for (const o of sellableOrders(orders)) {
    const row = map.get(o.userId) ?? { key: o.userId, name: o.userName || '-', value: 0, count: 0 };
    row.value += netOrderTotal(o);
    row.count += 1;
    map.set(o.userId, row);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

export function orderTypeStats(orders: Order[]): NamedStat[] {
  const map = new Map<string, NamedStat>();
  for (const o of sellableOrders(orders)) {
    const row = map.get(o.type) ?? { key: o.type, name: o.type, value: 0, count: 0 };
    row.value += netOrderTotal(o);
    row.count += 1;
    map.set(o.type, row);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

/** Percentage change, guarding against a zero baseline. */
export function growth(current: number, previous: number): number | null {
  if (!previous) return current > 0 ? null : 0;
  return ((current - previous) / previous) * 100;
}
