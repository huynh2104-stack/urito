import { dayKey, eachDay } from '@/core/date';
import { localeTag } from '@/core/money';
import type { NamedStat, ProductStat, SalesSummary, SeriesPoint } from './reports';
import type {
  DailyCountBucket,
  DailyProductStatsRow,
  DailyStatsRow,
  Expense,
  Lang,
  Product,
  TaxLine,
} from '@/db/types';

export function summariseRollups(rows: DailyStatsRow[], expenses: Expense[] = []): SalesSummary {
  let revenue = 0;
  let refunds = 0;
  let netRevenue = 0;
  let orderCount = 0;
  let cogs = 0;
  let grossProfit = 0;
  let discount = 0;
  let tax = 0;
  let serviceCharge = 0;
  let itemsSold = 0;
  let voidCount = 0;

  for (const r of rows) {
    revenue += r.revenue;
    refunds += r.refunds;
    netRevenue += r.netRevenue;
    orderCount += r.orderCount;
    cogs += r.cogs;
    grossProfit += r.grossProfit;
    discount += r.discount;
    tax += r.tax;
    serviceCharge += r.serviceCharge;
    itemsSold += r.itemsSold;
    voidCount += r.voidCount;
  }
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  return {
    revenue,
    refunds,
    netRevenue,
    orderCount,
    avgOrder: orderCount ? Math.round(netRevenue / orderCount) : 0,
    cogs,
    grossProfit,
    discount,
    tax,
    serviceCharge,
    itemsSold,
    expenses: expenseTotal,
    netProfit: grossProfit - expenseTotal,
    voidCount,
  };
}

export function revenueByDayFromRollups(
  rows: DailyStatsRow[],
  from: number,
  to: number,
  lang: Lang = 'ja',
): SeriesPoint[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const dayFmt = new Intl.DateTimeFormat(localeTag(lang), { month: 'numeric', day: 'numeric' });
  return eachDay(from, to).map((ts) => {
    const k = dayKey(ts);
    const r = byDay.get(k);
    return {
      key: k,
      label: dayFmt.format(ts),
      value: r?.netRevenue ?? 0,
      secondary: r?.grossProfit ?? 0,
    };
  });
}

export function revenueByHourFromRollups(rows: DailyStatsRow[]): SeriesPoint[] {
  const totals = new Array<number>(24).fill(0);
  const counts = new Array<number>(24).fill(0);
  for (const r of rows) {
    r.byHour.forEach((b, h) => {
      if (h < 24) {
        totals[h] += b.value;
        counts[h] += b.count;
      }
    });
  }
  return totals.map((value, h) => ({
    key: String(h),
    label: `${String(h).padStart(2, '0')}h`,
    value,
    secondary: counts[h],
  }));
}

export function productStatsFromRollups(rows: DailyProductStatsRow[]): ProductStat[] {
  const map = new Map<string, ProductStat>();
  for (const r of rows) {
    const cur = map.get(r.productId) ?? {
      productId: r.productId,
      name: r.name,
      qty: 0,
      revenue: 0,
      profit: 0,
    };
    cur.qty += r.qty;
    cur.revenue += r.revenue;
    cur.profit += r.profit;
    if (r.name) cur.name = r.name;
    map.set(r.productId, cur);
  }
  return [...map.values()].filter((p) => p.qty > 0).sort((a, b) => b.revenue - a.revenue);
}

export function categoryStatsFromProductStats(stats: ProductStat[], products: Product[]): NamedStat[] {
  const catOf = new Map(products.map((p) => [p.id, p.categoryId]));
  const map = new Map<string, NamedStat>();
  for (const stat of stats) {
    const key = catOf.get(stat.productId) ?? '';
    const row = map.get(key) ?? { key, name: '', value: 0, count: 0 };
    row.value += stat.revenue;
    row.count += stat.qty;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

function mergeCountRecord(rows: DailyStatsRow[], pick: (r: DailyStatsRow) => Record<string, DailyCountBucket>): NamedStat[] {
  const map = new Map<string, NamedStat>();
  for (const r of rows) {
    for (const [k, b] of Object.entries(pick(r))) {
      const cur = map.get(k) ?? { key: k, name: k, value: 0, count: 0 };
      cur.value += b.value;
      cur.count += b.count;
      map.set(k, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

export function paymentStatsFromRollups(rows: DailyStatsRow[]): NamedStat[] {
  return mergeCountRecord(rows, (r) => r.byPayment);
}

export function orderTypeStatsFromRollups(rows: DailyStatsRow[]): NamedStat[] {
  return mergeCountRecord(rows, (r) => r.byType);
}

export function channelStatsFromRollups(rows: DailyStatsRow[]): NamedStat[] {
  return mergeCountRecord(rows, (r) => r.byChannel ?? {});
}

export function employeeStatsFromRollups(rows: DailyStatsRow[]): NamedStat[] {
  const map = new Map<string, NamedStat>();
  for (const r of rows) {
    for (const [k, b] of Object.entries(r.byUser)) {
      const cur = map.get(k) ?? { key: k, name: b.name || '-', value: 0, count: 0 };
      cur.value += b.value;
      cur.count += b.count;
      if (b.name) cur.name = b.name;
      map.set(k, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

export function taxLinesFromRollups(rows: DailyStatsRow[]): TaxLine[] {
  const byRate = new Map<number, TaxLine>();
  for (const r of rows) {
    for (const tl of Object.values(r.taxLines)) {
      const cur = byRate.get(tl.rateBp) ?? { rateBp: tl.rateBp, gross: 0, net: 0, tax: 0 };
      cur.gross += tl.gross;
      cur.net += tl.net;
      cur.tax += tl.tax;
      byRate.set(tl.rateBp, cur);
    }
  }
  return [...byRate.values()].sort((a, b) => b.rateBp - a.rateBp);
}
