import { newId } from '@/core/id';
import { normaliseQty } from '@/core/money';
import { normaliseCode, normaliseText } from '@/core/search';
import { computeTaxLines, effectiveTaxRateBp } from '@/core/tax';
import { db, kvGet, kvSet } from '@/db/db';
import { getDeviceNo, nextSeq } from '@/db/seq';
import { parseCsv } from './csv';
import { parseShopifyMoney } from './exchange/shopify';
import { applyStockChanges, type StockChange } from './inventory';
import { applyOrderRollupDelta } from './rollups';
import type { CurrencyCode, Order, OrderItem, Product, Settings, User } from '@/db/types';

export type EcChannel = 'shopify' | 'ec';

export interface ParsedEcOrderLine {
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export interface ParsedEcOrder {
  externalId: string;
  channel: EcChannel;
  paidAt: number;
  customerName: string;
  discount: number;
  tax: number;
  shipping: number;
  total: number;
  note: string;
  lines: ParsedEcOrderLine[];
}

export interface EcImportResult {
  imported: number;
  skippedDuplicates: number;
  unresolvedSkus: string[];
}

export interface PendingEcMapping {
  id: string;
  key: string;
  sku: string;
  name: string;
  qty: number;
  orderId: string;
  orderItemId: string;
  externalId: string;
  channel: EcChannel;
  createdAt: number;
}

export const EC_PENDING_KV = 'ec.pending';
export const EC_SKU_MAP_KV = 'ec.skuMap';

function parseTimestamp(raw: string): number {
  if (!raw) return Date.now();
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? ts : Date.now();
}

/** Shopify / EC 注文 CSV を外部注文番号単位の配列へ変換する。 */
export function parseEcOrdersCsv(
  csvText: string,
  opts: { currency: CurrencyCode; defaultChannel?: EcChannel },
): ParsedEcOrder[] {
  const table = parseCsv(csvText);
  if (table.length < 2) return [];
  const [head, ...body] = table;
  const col = new Map<string, number>();
  head.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    if (key && !col.has(key)) col.set(key, i);
  });

  const cell = (row: string[], ...candidates: string[]): string => {
    for (const c of candidates) {
      const idx = col.get(c.toLowerCase());
      if (idx !== undefined) {
        const val = String(row[idx] ?? '').trim();
        if (val !== '') return val;
      }
    }
    return '';
  };

  const defaultChannel = opts.defaultChannel ?? (col.has('name') && col.has('lineitem name') ? 'shopify' : 'ec');
  const grouped = new Map<string, ParsedEcOrder>();

  for (const row of body) {
    const externalId = cell(row, 'name', 'order id', 'id', 'external id', '注文番号');
    if (!externalId) continue;

    const cancelled = cell(row, 'cancelled at');
    const finStatus = cell(row, 'financial status', 'status').toLowerCase();
    if (cancelled || finStatus === 'voided' || finStatus === 'cancelled') continue;

    const channelRaw = cell(row, 'channel', 'source').toLowerCase();
    const channel: EcChannel = channelRaw === 'shopify' ? 'shopify' : channelRaw === 'ec' ? 'ec' : defaultChannel;

    const lineName = cell(row, 'lineitem name', 'item name', '商品名');
    const lineSku = cell(row, 'lineitem sku', 'sku', 'barcode', '商品コード', 'バーコード');
    const qtyRaw = Number(cell(row, 'lineitem quantity', 'qty', 'quantity', '数量') || '1');
    const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? normaliseQty(qtyRaw) : 1;
    const unitPrice = parseShopifyMoney(cell(row, 'lineitem price', 'unit price', 'price', '単価'), opts.currency);

    let entry = grouped.get(`${channel}\0${externalId}`);
    if (!entry) {
      const paidRaw = cell(row, 'paid at', 'created at', 'date', '注文日時');
      entry = {
        externalId,
        channel,
        paidAt: parseTimestamp(paidRaw),
        customerName: cell(row, 'billing name', 'shipping name', 'customer name', 'email', '顧客名'),
        discount: parseShopifyMoney(cell(row, 'discount amount', 'discount', '割引'), opts.currency),
        tax: parseShopifyMoney(cell(row, 'taxes', 'tax', '税額'), opts.currency),
        shipping: parseShopifyMoney(cell(row, 'shipping', '送料'), opts.currency),
        total: parseShopifyMoney(cell(row, 'total', '合計'), opts.currency),
        note: cell(row, 'notes', 'note', '備考'),
        lines: [],
      };
      grouped.set(`${channel}\0${externalId}`, entry);
    }

    if (lineName || lineSku) {
      entry.lines.push({
        sku: lineSku,
        name: lineName || lineSku,
        qty,
        unitPrice,
      });
    }
  }

  return [...grouped.values()].filter((o) => o.lines.length > 0);
}

/** パース済み EC 注文を冪等に取込み、在庫引当と日次集計テーブルを更新する。 */
export async function importEcOrders(
  parsedOrders: ParsedEcOrder[],
  ctx: { user: User | null; settings: Settings },
): Promise<EcImportResult> {
  if (!parsedOrders.length) {
    return { imported: 0, skippedDuplicates: 0, unresolvedSkus: [] };
  }

  const allProducts = await db.products.toArray();
  const byId = new Map(allProducts.map((p) => [p.id, p]));
  const bySku = new Map<string, Product>();
  const byBarcode = new Map<string, Product>();
  const byName = new Map<string, Product>();
  for (const p of allProducts) {
    if (p.sku) bySku.set(normaliseCode(p.sku), p);
    if (p.barcode) {
      for (const tok of p.barcode.split(/[\s,]+/)) {
        if (tok) byBarcode.set(normaliseCode(tok), p);
      }
    }
    byName.set(normaliseText(p.name), p);
    if (p.i18n) {
      for (const loc of Object.values(p.i18n)) {
        if (loc?.name) byName.set(normaliseText(loc.name), p);
      }
    }
  }

  const savedMap = (await kvGet<Record<string, string>>(EC_SKU_MAP_KV)) ?? {};
  const existingPending = (await kvGet<PendingEcMapping[]>(EC_PENDING_KV)) ?? [];
  const addedPending: PendingEcMapping[] = [];

  const unresolvedSet = new Set<string>();
  let imported = 0;
  let skippedDuplicates = 0;
  const deviceNo = await getDeviceNo();

  await db.transaction(
    'rw',
    [db.orders, db.products, db.stockMovements, db.dailyStats, db.dailyProductStats, db.kv],
    async () => {
      for (const src of parsedOrders) {
        // F-03: 複合インデックス [channel+externalId] により既取込の外部注文はスキップして冪等性を保つ
        const existing = await db.orders.where('[channel+externalId]').equals([src.channel, src.externalId]).first();
        if (existing) {
          skippedDuplicates += 1;
          continue;
        }

        const seq = await nextSeq('order');
        const id = newId('o');
        const code = `${src.channel.toUpperCase()}-${deviceNo}-${String(seq).padStart(4, '0')}`;
        const items: OrderItem[] = [];
        const stockDeltas: StockChange[] = [];

        for (const line of src.lines) {
          const skuKey = line.sku ? normaliseCode(line.sku) : '';
          const nameKey = normaliseText(line.name);
          const mappedId = (skuKey && savedMap[skuKey]) || savedMap[nameKey];
          const matched =
            (skuKey ? bySku.get(skuKey) : undefined) ??
            (mappedId ? byId.get(mappedId) : undefined) ??
            (skuKey ? byBarcode.get(skuKey) : undefined) ??
            byName.get(nameKey);
          const itemId = newId('oi');
          if (!matched) {
            const pendingKey = skuKey || nameKey;
            unresolvedSet.add(line.sku || line.name);
            addedPending.push({
              id: newId('ep'),
              key: pendingKey,
              sku: line.sku,
              name: line.name,
              qty: line.qty,
              orderId: id,
              orderItemId: itemId,
              externalId: src.externalId,
              channel: src.channel,
              createdAt: src.paidAt,
            });
          }

          const gross = Math.round(line.unitPrice * line.qty);
          const cost = matched?.cost ?? 0;
          const taxCat = matched?.taxCategory ?? 'standard';
          const rateBp = effectiveTaxRateBp(taxCat, 'delivery', ctx.settings);

          items.push({
            id: itemId,
            productId: matched?.id ?? '',
            name: matched?.name ?? line.name,
            unit: matched?.unit ?? '',
            price: line.unitPrice,
            cost,
            qty: line.qty,
            modifiers: [],
            discountType: 'none',
            discountValue: 0,
            note: line.sku && !matched ? `SKU:${line.sku}` : '',
            gross,
            discount: 0,
            total: gross,
            refundedQty: 0,
            taxCategory: taxCat,
            taxRateBp: rateBp,
          });

          if (matched && matched.trackStock && !matched.isService) {
            stockDeltas.push({
              productId: matched.id,
              delta: -line.qty,
              type: 'sale',
              cost: matched.cost,
              refType: 'ec',
              refId: src.externalId,
              note: `${src.channel}:${src.externalId}`,
            });
          }
        }

        const subtotal = items.reduce((s, i) => s + i.gross, 0);
        const taxResult = computeTaxLines({
          items,
          discount: src.discount,
          serviceCharge: src.shipping,
          taxMode: ctx.settings.taxMode,
          taxRate: ctx.settings.taxRate,
          taxRates: ctx.settings.taxRates,
          taxRounding: ctx.settings.taxRounding,
          orderType: 'delivery',
          eatInRule: ctx.settings.eatInRule,
        });
        const taxLines = taxResult.lines;
        const computedTax = src.tax || taxResult.tax;
        const total =
          src.total > 0
            ? src.total
            : Math.max(0, subtotal - src.discount + (ctx.settings.taxMode === 'exclusive' ? computedTax : 0) + src.shipping);
        const cogs = items.reduce((s, i) => s + Math.round(i.cost * i.qty), 0);

        const order: Order = {
          id,
          code,
          type: 'delivery',
          status: 'paid',
          tableId: null,
          tableName: '',
          guests: 1,
          customerId: null,
          customerName: src.customerName,
          items,
          subtotal,
          discountType: src.discount > 0 ? 'amount' : 'none',
          discountValue: src.discount,
          discount: src.discount,
          serviceCharge: src.shipping,
          taxMode: ctx.settings.taxMode,
          taxRate: ctx.settings.taxRate,
          tax: computedTax,
          taxLines,
          rounding: 0,
          total,
          cogs,
          paidAmount: total,
          changeAmount: 0,
          dueAmount: 0,
          payments: [{ id: newId('pm'), method: 'transfer', amount: total, ref: src.externalId, at: src.paidAt }],
          refunds: [],
          refundedAmount: 0,
          pointsEarned: 0,
          pointsUsed: 0,
          pointsValue: 0,
          note: src.note || src.externalId,
          userId: ctx.user?.id ?? '',
          userName: ctx.user?.name ?? src.channel.toUpperCase(),
          shiftId: null,
          createdAt: src.paidAt,
          updatedAt: src.paidAt,
          paidAt: src.paidAt,
          voidedAt: 0,
          voidReason: '',
          channel: src.channel,
          externalId: src.externalId,
        };

        await db.orders.put(order);
        if (stockDeltas.length) {
          await applyStockChanges(stockDeltas, ctx.user);
        }
        await applyOrderRollupDelta(null, order);
        imported += 1;
      }

      if (addedPending.length) {
        await db.kv.put({ key: EC_PENDING_KV, value: [...existingPending, ...addedPending] });
      }
    },
  );

  return {
    imported,
    skippedDuplicates,
    unresolvedSkus: [...unresolvedSet],
  };
}

/** F-03: 未紐付け EC 明細を商品へ紐付け、在庫引当・原価/集計補正と次回以降のSKU学習マッピングを保存する。 */
export async function resolvePendingEcMapping(
  pendingId: string,
  productId: string,
  user: User | null,
): Promise<number> {
  let resolvedCount = 0;
  await db.transaction(
    'rw',
    [db.orders, db.products, db.stockMovements, db.dailyStats, db.dailyProductStats, db.kv],
    async () => {
      const product = await db.products.get(productId);
      if (!product) return;
      const pendingList = (await kvGet<PendingEcMapping[]>(EC_PENDING_KV)) ?? [];
      const target = pendingList.find((p) => p.id === pendingId);
      if (!target) return;

      const targets = pendingList.filter((p) => p.key === target.key);
      const remaining = pendingList.filter((p) => p.key !== target.key);
      const byOrderId = new Map<string, PendingEcMapping[]>();
      for (const p of targets) {
        const list = byOrderId.get(p.orderId) ?? [];
        list.push(p);
        byOrderId.set(p.orderId, list);
      }

      for (const [orderId, group] of byOrderId) {
        const order = await db.orders.get(orderId);
        if (!order) continue;
        const itemIds = new Set(group.map((g) => g.orderItemId));
        const nextItems = order.items.map((item) =>
          itemIds.has(item.id)
            ? { ...item, productId: product.id, name: product.name, unit: product.unit, cost: product.cost, note: '' }
            : item,
        );
        const cogs = nextItems.reduce((s, i) => s + Math.round(i.cost * Math.max(0, i.qty - i.refundedQty)), 0);
        const nextOrder: Order = { ...order, items: nextItems, cogs, updatedAt: Date.now() };
        await db.orders.put(nextOrder);
        await applyOrderRollupDelta(order, nextOrder);

        if (product.trackStock && !product.isService) {
          const deltas: StockChange[] = group.map((g) => ({
            productId: product.id,
            delta: -g.qty,
            type: 'sale',
            cost: product.cost,
            refType: 'ec',
            refId: g.externalId,
            note: `${g.channel}:${g.externalId}`,
          }));
          await applyStockChanges(deltas, user);
        }
        resolvedCount += group.length;
      }

      const skuMap = { ...((await kvGet<Record<string, string>>(EC_SKU_MAP_KV)) ?? {}), [target.key]: product.id };
      await kvSet(EC_SKU_MAP_KV, skuMap);
      await kvSet(EC_PENDING_KV, remaining);
    },
  );
  return resolvedCount;
}

/** F-03: 紐付け待ち EC 明細をキューから除外する。 */
export async function dismissPendingEcMapping(pendingId: string): Promise<void> {
  const list = (await kvGet<PendingEcMapping[]>(EC_PENDING_KV)) ?? [];
  await kvSet(
    EC_PENDING_KV,
    list.filter((p) => p.id !== pendingId),
  );
}
