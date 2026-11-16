import { dayKey } from '@/core/date';
import { orderTaxLinesForDisplay } from '@/core/tax';
import { db } from '@/db/db';
import type {
  DailyCountBucket,
  DailyProductStatsRow,
  DailyStatsRow,
  Order,
} from '@/db/types';

function effectiveCogs(order: Order): number {
  return order.items.reduce((s, i) => s + Math.round(i.cost * Math.max(0, i.qty - i.refundedQty)), 0);
}

function netOrderTotal(order: Order): number {
  return order.total - order.refundedAmount;
}

const BATCH_SIZE = 500;
const ROLLUP_BUILT_KV = 'rollups.v1.built';

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function emptyHourBuckets() {
  return Array.from({ length: 24 }, () => ({ value: 0, count: 0 }));
}

export function emptyDayStats(day: string): DailyStatsRow {
  return {
    day,
    revenue: 0,
    refunds: 0,
    netRevenue: 0,
    cogs: 0,
    grossProfit: 0,
    tax: 0,
    discount: 0,
    serviceCharge: 0,
    orderCount: 0,
    itemsSold: 0,
    voidCount: 0,
    byPayment: {},
    byHour: emptyHourBuckets(),
    byType: {},
    byUser: {},
    byChannel: {},
    taxLines: {},
    updatedAt: 0,
  };
}

function isSellable(o: Order): boolean {
  return o.status === 'paid' || o.status === 'refunded' || (o.status === 'void' && o.refunds.length > 0);
}

function bumpBucket(
  record: Record<string, DailyCountBucket>,
  key: string,
  valueDelta: number,
  countDelta: number,
): void {
  const cur = record[key] ?? { value: 0, count: 0 };
  cur.value += valueDelta;
  cur.count += countDelta;
  if (cur.value === 0 && cur.count <= 0) delete record[key];
  else record[key] = cur;
}

function ensureDay(map: Map<string, DailyStatsRow>, day: string): DailyStatsRow {
  let row = map.get(day);
  if (!row) {
    row = emptyDayStats(day);
    map.set(day, row);
  }
  return row;
}

function isDayRowEmpty(row: DailyStatsRow): boolean {
  return (
    row.revenue === 0 &&
    row.refunds === 0 &&
    row.netRevenue === 0 &&
    row.cogs === 0 &&
    row.grossProfit === 0 &&
    row.orderCount === 0 &&
    row.voidCount === 0
  );
}

export function prodStatKey(day: string, productId: string): string {
  return `${day}\0${productId}`;
}

/** 1伝票分の集計寄与（sign = 1 加算 / -1 減算）を日次・商品別マップへ反映する。 */
export function applyOrderContribution(
  dailyMap: Map<string, DailyStatsRow>,
  productMap: Map<string, DailyProductStatsRow>,
  order: Order,
  sign: 1 | -1,
): void {
  const sellable = isSellable(order);
  const isVoidPaid = order.status === 'void' && order.paidAt > 0;
  if (!sellable && !isVoidPaid) return;

  const paidTs = order.paidAt || order.createdAt;
  const pDay = dayKey(paidTs);
  const dayRow = ensureDay(dailyMap, pDay);
  dayRow.updatedAt = Date.now();

  if (order.status === 'void') {
    dayRow.voidCount += sign;
  }

  if (!sellable) return;

  const cogs = effectiveCogs(order);
  const itemDiscount = order.items.reduce((s, i) => s + i.discount, 0);
  const itemsSold = order.items.reduce((s, i) => s + Math.max(0, i.qty - i.refundedQty), 0);
  const net = netOrderTotal(order);

  dayRow.revenue += sign * order.total;
  dayRow.netRevenue += sign * order.total;
  dayRow.cogs += sign * cogs;
  dayRow.tax += sign * order.tax;
  dayRow.grossProfit += sign * (order.total - order.tax - cogs);
  dayRow.discount += sign * (order.discount + itemDiscount);
  dayRow.serviceCharge += sign * order.serviceCharge;
  dayRow.orderCount += sign;
  dayRow.itemsSold += sign * itemsSold;

  const hour = new Date(paidTs).getHours();
  if (dayRow.byHour[hour]) {
    dayRow.byHour[hour].value += sign * net;
    dayRow.byHour[hour].count += sign;
  }

  bumpBucket(dayRow.byType, order.type, sign * net, sign);
  const ch = (order as Order & { channel?: string }).channel ?? 'pos';
  bumpBucket(dayRow.byChannel, ch, sign * net, sign);

  const userKey = order.userId;
  const uBucket = dayRow.byUser[userKey] ?? { name: order.userName || '-', value: 0, count: 0 };
  uBucket.value += sign * net;
  uBucket.count += sign;
  if (order.userName && sign > 0) uBucket.name = order.userName;
  if (uBucket.value === 0 && uBucket.count <= 0) delete dayRow.byUser[userKey];
  else dayRow.byUser[userKey] = uBucket;

  for (const p of order.payments) {
    bumpBucket(dayRow.byPayment, p.method, sign * p.amount, sign);
  }

  for (const tl of orderTaxLinesForDisplay(order)) {
    const k = String(tl.rateBp);
    const cur = dayRow.taxLines[k] ?? { rateBp: tl.rateBp, gross: 0, net: 0, tax: 0 };
    cur.gross += sign * tl.gross;
    cur.net += sign * tl.net;
    cur.tax += sign * tl.tax;
    if (cur.gross === 0 && cur.net === 0 && cur.tax === 0) delete dayRow.taxLines[k];
    else dayRow.taxLines[k] = cur;
  }

  for (const item of order.items) {
    const qty = Math.max(0, item.qty - item.refundedQty);
    if (qty <= 0) continue;
    const rev = Math.round((item.total * qty) / (item.qty || 1));
    const cost = Math.round(item.cost * qty);
    const k = prodStatKey(pDay, item.productId);
    const cur = productMap.get(k) ?? {
      day: pDay,
      productId: item.productId,
      name: item.name,
      qty: 0,
      revenue: 0,
      profit: 0,
    };
    cur.qty += sign * qty;
    cur.revenue += sign * rev;
    cur.profit += sign * (rev - cost);
    if (sign > 0 && item.name) cur.name = item.name;
    productMap.set(k, cur);
  }

  // 返金は実返金日の売上・粗利から控除する（B-02/B-04 準拠）
  for (const r of order.refunds) {
    const rDay = dayKey(r.at);
    const rRow = ensureDay(dailyMap, rDay);
    rRow.updatedAt = Date.now();
    rRow.refunds += sign * r.amount;
    rRow.netRevenue -= sign * r.amount;
    rRow.grossProfit -= sign * r.amount;
  }
}

export function buildRollupsFromOrders(orders: Iterable<Order>): {
  daily: DailyStatsRow[];
  products: DailyProductStatsRow[];
} {
  const dailyMap = new Map<string, DailyStatsRow>();
  const productMap = new Map<string, DailyProductStatsRow>();
  for (const order of orders) {
    applyOrderContribution(dailyMap, productMap, order, 1);
  }
  return {
    daily: [...dailyMap.values()].filter((d) => !isDayRowEmpty(d)),
    products: [...productMap.values()].filter((p) => p.qty > 0),
  };
}

function collectAffectedTargets(order: Order | null, days: Set<string>, prodKeys: Map<string, [string, string]>) {
  if (!order) return;
  const sellable = isSellable(order);
  const isVoidPaid = order.status === 'void' && order.paidAt > 0;
  if (!sellable && !isVoidPaid) return;

  const pDay = dayKey(order.paidAt || order.createdAt);
  days.add(pDay);
  for (const r of order.refunds) days.add(dayKey(r.at));
  if (sellable) {
    for (const i of order.items) {
      prodKeys.set(prodStatKey(pDay, i.productId), [pDay, i.productId]);
    }
  }
}

/** 伝票の作成・返金・取消時に呼び出し、変更前後差分で集計テーブルを即時更新する（同一TX内で実行可）。 */
export async function applyOrderRollupDelta(before: Order | null, after: Order | null): Promise<void> {
  const days = new Set<string>();
  const prodTuples = new Map<string, [string, string]>();
  collectAffectedTargets(before, days, prodTuples);
  collectAffectedTargets(after, days, prodTuples);
  if (days.size === 0) return;

  const dayList = [...days];
  const existingDays = await db.dailyStats.bulkGet(dayList);
  const dailyMap = new Map<string, DailyStatsRow>();
  existingDays.forEach((row, idx) => {
    if (row) dailyMap.set(dayList[idx], structuredClone(row));
  });

  const tupleList = [...prodTuples.values()];
  const existingProds = tupleList.length ? await db.dailyProductStats.bulkGet(tupleList) : [];
  const productMap = new Map<string, DailyProductStatsRow>();
  existingProds.forEach((row) => {
    if (row) productMap.set(prodStatKey(row.day, row.productId), { ...row });
  });

  if (before) applyOrderContribution(dailyMap, productMap, before, -1);
  if (after) applyOrderContribution(dailyMap, productMap, after, 1);

  const dayPut: DailyStatsRow[] = [];
  const dayDelete: string[] = [];
  for (const [d, row] of dailyMap) {
    if (isDayRowEmpty(row)) dayDelete.push(d);
    else dayPut.push(row);
  }

  const prodPut: DailyProductStatsRow[] = [];
  const prodDelete: [string, string][] = [];
  for (const row of productMap.values()) {
    if (row.qty <= 0) prodDelete.push([row.day, row.productId]);
    else prodPut.push(row);
  }

  if (dayDelete.length) await db.dailyStats.bulkDelete(dayDelete);
  if (dayPut.length) await db.dailyStats.bulkPut(dayPut);
  if (prodDelete.length) await db.dailyProductStats.bulkDelete(prodDelete);
  if (prodPut.length) await db.dailyProductStats.bulkPut(prodPut);
}

/** 全伝票をバッチ走査して日次・商品別集計テーブルを再構築する（バッチ間でメインスレッドを解放）。 */
export async function rebuildRollups(opts?: {
  batchSize?: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<number> {
  const batchSize = opts?.batchSize ?? BATCH_SIZE;
  const keys = await db.orders.toCollection().primaryKeys();
  const total = keys.length;
  const dailyMap = new Map<string, DailyStatsRow>();
  const productMap = new Map<string, DailyProductStatsRow>();

  for (let i = 0; i < total; i += batchSize) {
    const chunk = await db.orders.bulkGet(keys.slice(i, i + batchSize));
    for (const order of chunk) {
      if (order) applyOrderContribution(dailyMap, productMap, order, 1);
    }
    opts?.onProgress?.(Math.min(i + batchSize, total), total);
    if (i + batchSize < total) await yieldToMain();
  }

  const dailyRows = [...dailyMap.values()].filter((d) => !isDayRowEmpty(d));
  const prodRows = [...productMap.values()].filter((p) => p.qty > 0);

  await db.transaction('rw', [db.dailyStats, db.dailyProductStats, db.kv], async () => {
    await db.dailyStats.clear();
    await db.dailyProductStats.clear();
    if (dailyRows.length) await db.dailyStats.bulkPut(dailyRows);
    if (prodRows.length) await db.dailyProductStats.bulkPut(prodRows);
    await db.kv.put({ key: ROLLUP_BUILT_KV, value: Date.now() });
  });

  return total;
}

let pendingEnsure: Promise<void> | null = null;

/** スキーマv5移行後など集計テーブルが未構築の場合にバックグラウンドで構築する。 */
export function ensureRollupsBuilt(): Promise<void> {
  if (!pendingEnsure) {
    pendingEnsure = (async () => {
      const built = await db.kv.get(ROLLUP_BUILT_KV);
      if (built) return;
      const statsCount = await db.dailyStats.count();
      if (statsCount > 0) {
        await db.kv.put({ key: ROLLUP_BUILT_KV, value: Date.now() });
        return;
      }
      const orderCount = await db.orders.count();
      if (orderCount === 0) {
        await db.kv.put({ key: ROLLUP_BUILT_KV, value: Date.now() });
        return;
      }
      await rebuildRollups();
    })().finally(() => {
      pendingEnsure = null;
    });
  }
  return pendingEnsure;
}
