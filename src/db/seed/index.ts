import { computeLine, computeTotals } from '@/core/cart';
import { formatCode, newId } from '@/core/id';
import { effectiveTaxRateBp } from '@/core/tax';
import { db } from '../db';
import { docPrefixes, PALETTE, defaultOwner, defaultSettings } from '../defaults';
import { EN_CATALOG } from './en';
import { JA_CATALOG } from './ja';
import { scaleCurrency, type MarketCatalog, type MarketSeedSet } from './types';
import { VI_CATALOG } from './vi';
import type {
  Area,
  BusinessType,
  Category,
  CurrencyCode,
  Customer,
  DiningTable,
  Lang,
  ModifierGroup,
  Order,
  OrderItem,
  OrderType,
  PayMethod,
  Product,
  Settings,
  User,
} from '../types';

export type { MarketCatalog, MarketSeedSet, MarketProductSpec } from './types';

const CATALOGS: Record<Lang, MarketCatalog> = {
  ja: JA_CATALOG,
  vi: VI_CATALOG,
  en: EN_CATALOG,
};

export interface SeedOptions {
  businessType: BusinessType;
  lang: Lang;
  currency: CurrencyCode;
  shopName: string;
  ownerName: string;
  withSampleData: boolean;
  /** ダッシュボード・売上レポート検証用に過去30日分の取引履歴を生成する。 */
  withSampleHistory?: boolean;
  /** テスト等で外部fetchを行わない場合に false を指定する。 */
  loadImages?: boolean;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

/** サンプルWebP画像をトランザクション外で先読みし、取得失敗（オフライン等）時はモノグラムへフォールバックする。 */
async function preloadSampleImages(set: MarketSeedSet, enabled: boolean): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!enabled || typeof window === 'undefined' || typeof fetch !== 'function' || typeof FileReader === 'undefined') {
    return map;
  }
  const paths = [...new Set(set.products.map((p) => p.image).filter((v): v is string => Boolean(v)))];
  await Promise.all(
    paths.map(async (path) => {
      try {
        const res = await fetch(path);
        if (!res.ok) return;
        const blob = await res.blob();
        const dataUrl = await blobToDataUrl(blob);
        if (dataUrl) map.set(path, dataUrl);
      } catch {
        /* ネットワーク未接続時は画像なしのまま継続し、モノグラムを表示する */
      }
    }),
  );
  return map;
}

/** 初期設定・オーナー・業種別サンプル商品・顧客・過去30日分の履歴をシードする。 */
export async function seedWorkspace(opts: SeedOptions): Promise<Settings> {
  const catalog = CATALOGS[opts.lang] ?? EN_CATALOG;
  const set = catalog[opts.businessType];
  const prefixes = docPrefixes(opts.lang);
  const base = defaultSettings(opts.lang, opts.currency);

  const settings: Settings = {
    ...base,
    shopName: opts.shopName,
    taxCode: opts.lang === 'ja' ? 'T1234567890123' : '',
    businessType: opts.businessType,
    orderPrefix: prefixes.order[opts.businessType],
    eatInRule: set.eatInRule ?? base.eatInRule,
    serviceChargeRate: 0,
    onboarded: true,
  };
  const owner = defaultOwner(opts.ownerName || (opts.lang === 'ja' ? 'オーナー' : 'Admin'));

  const loadedImages = opts.withSampleData
    ? await preloadSampleImages(set, opts.loadImages !== false)
    : new Map<string, string>();

  await db.transaction(
    'rw',
    [
      db.settings,
      db.users,
      db.categories,
      db.modifierGroups,
      db.products,
      db.areas,
      db.diningTables,
      db.customers,
      db.orders,
      db.kv,
    ],
    async () => {
      await db.settings.put(settings);
      await db.users.put(owner);

      if (!opts.withSampleData) return;

      const cats: Category[] = set.categories.map((name, i) => ({
        id: newId('c'),
        name,
        color: PALETTE[i % PALETTE.length],
        sort: i,
        active: true,
      }));
      await db.categories.bulkPut(cats);

      const mods: ModifierGroup[] = set.modifiers.map((m, i) => ({
        id: newId('m'),
        name: m.name,
        required: m.required,
        multiple: m.multiple,
        sort: i,
        options: m.options.map((o) => ({
          id: newId('o'),
          name: o.name,
          priceDelta: scaleCurrency(o.delta, set.baseCurrency, opts.currency),
        })),
      }));
      if (mods.length) await db.modifierGroups.bulkPut(mods);

      const now = Date.now();
      const products: Product[] = set.products.map((p, i) => {
        const stock = p.stock ?? 0;
        const minStock =
          p.minStock !== undefined ? p.minStock : p.stock !== undefined ? Math.max(4, Math.round(stock * 0.2)) : 0;
        return {
          id: newId('p'),
          sku: `${prefixes.sku}${String(i + 1).padStart(4, '0')}`,
          barcode: p.barcode ?? '',
          name: p.name,
          kana: p.kana ?? '',
          categoryId: cats[p.cat]?.id ?? '',
          price: scaleCurrency(p.price, set.baseCurrency, opts.currency),
          cost: scaleCurrency(p.cost, set.baseCurrency, opts.currency),
          unit: p.unit ?? '',
          trackStock: p.stock !== undefined,
          stock,
          minStock,
          isService: false,
          active: true,
          color: PALETTE[p.cat % PALETTE.length],
          image: p.image ? (loadedImages.get(p.image) ?? '') : '',
          modifierGroupIds: (p.mods ?? []).map((mi) => mods[mi]?.id).filter((id): id is string => Boolean(id)),
          favorite: !!p.fav,
          taxCategory: p.taxCategory ?? 'standard',
          sort: i,
          createdAt: now,
          updatedAt: now,
        };
      });
      await db.products.bulkPut(products);

      if (set.areas.length) {
        const areas: Area[] = set.areas.map((name, i) => ({ id: newId('a'), name, sort: i }));
        await db.areas.bulkPut(areas);
        const tables: DiningTable[] = [];
        areas.forEach((area, ai) => {
          const count = set.tablesPerArea[ai] ?? 4;
          for (let i = 1; i <= count; i++) {
            tables.push({
              id: newId('t'),
              areaId: area.id,
              name: `${String.fromCharCode(65 + ai)}${i}`,
              seats: 4,
              sort: i,
            });
          }
        });
        await db.diningTables.bulkPut(tables);
      }

      const walkIn: Customer = {
        id: newId('cu'),
        code: `${prefixes.customer}0001`,
        name: opts.lang === 'ja' ? '常連のお客様' : opts.lang === 'vi' ? 'Khách quen' : 'Regular customer',
        phone: '',
        address: '',
        note: '',
        points: 18,
        debt: 0,
        totalSpent: 0,
        orderCount: 0,
        birthday: '',
        active: true,
        createdAt: now,
        updatedAt: now,
      };

      const debtCustomer: Customer = {
        id: newId('cu'),
        code: `${prefixes.customer}0002`,
        name: opts.lang === 'ja' ? '田中 美咲' : opts.lang === 'vi' ? 'Chị Minh' : 'Alex Taylor',
        phone: opts.lang === 'ja' ? '090-1234-5678' : opts.lang === 'vi' ? '0901234567' : '555-0102',
        address: '',
        note: opts.lang === 'ja' ? '月末締め掛売対象' : '',
        points: 12,
        debt: 0,
        totalSpent: 0,
        orderCount: 0,
        birthday: '',
        active: true,
        createdAt: now,
        updatedAt: now,
      };

      await db.customers.bulkPut([walkIn, debtCustomer]);

      let nextOrderSeq = 1;
      if (opts.withSampleHistory) {
        const result = buildSampleOrders(products, owner, settings, opts.businessType, debtCustomer);
        await db.orders.bulkPut(result.orders);
        if (result.debtCustomer.debt > 0) {
          await db.customers.put(result.debtCustomer);
        }
        nextOrderSeq = result.orders.length + 1;
        await db.settings.put({ ...settings, nextOrderNo: nextOrderSeq, updatedAt: Date.now() });
      }

      await db.kv.bulkPut([
        { key: 'seq.order', value: nextOrderSeq - 1 },
        { key: 'seq.sku', value: products.length },
        { key: 'seq.customer', value: 2 },
      ]);
    },
  );

  return settings;
}

export async function loadOrInitSettings(): Promise<Settings> {
  const existing = await db.settings.get('app');
  if (existing) return existing;
  const fresh = defaultSettings();
  await db.settings.put(fresh);
  return fresh;
}

/* ------------------------------------------------------------ サンプル取引履歴 */

/** 同じシードから毎回同一の擬似乱数列を得るための決定論的PRNG。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 過去30日分の取引履歴を決定論的に生成する（D-06）。
 * payOrder と同じ computeLine / computeTotals で税区分・軽減税率・端数処理を算出する。
 */
export function buildSampleOrders(
  products: Product[],
  owner: User,
  settings: Settings,
  businessType: BusinessType,
  debtCustomer: Customer,
): { orders: Order[]; debtCustomer: Customer } {
  const sellable = products.filter((p) => p.active && !p.isService);
  if (!sellable.length) return { orders: [], debtCustomer };

  const rand = mulberry32(20261116);
  const pick = <T,>(list: T[]): T => list[Math.floor(rand() * list.length)];
  const weighted = sellable.flatMap((p) => Array.from({ length: p.favorite ? 4 : 2 }, () => p));

  // 昼(12時台)と夕方(17-19時台)にピークを持たせる時間重み配列
  const hours =
    businessType === 'retail'
      ? [9, 10, 11, 12, 12, 12, 15, 16, 17, 17, 18, 18, 19, 19, 20]
      : businessType === 'cafe'
        ? [8, 9, 10, 12, 12, 13, 14, 15, 15, 16, 17, 18]
        : [11, 12, 12, 12, 13, 17, 18, 18, 19, 19, 20, 21];

  const methods: PayMethod[] = ['cash', 'cash', 'cash', 'qr', 'qr', 'card', 'ewallet'];
  const now = Date.now();
  const out: Order[] = [];
  let seq = 1;
  const updatedCustomer = { ...debtCustomer };

  for (let back = 29; back >= 0; back--) {
    const day = new Date(now);
    day.setDate(day.getDate() - back);
    day.setHours(0, 0, 0, 0);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    let count = 6 + Math.floor(rand() * 6) + (weekend ? 5 : 0);
    if (back === 0) count = Math.min(count, 6);

    const stamps: number[] = [];
    for (let i = 0; i < count; i++) {
      const at = new Date(day);
      at.setHours(pick(hours), Math.floor(rand() * 60), Math.floor(rand() * 60), 0);
      if (at.getTime() < now - 120_000) stamps.push(at.getTime());
    }
    stamps.sort((a, b) => a - b);

    for (let idx = 0; idx < stamps.length; idx++) {
      const at = stamps[idx];
      const orderType: OrderType =
        businessType === 'retail' ? 'retail' : rand() < 0.35 ? 'takeaway' : 'dine_in';

      const lineCount = 1 + Math.floor(rand() * 3);
      const chosen = new Map<string, { product: Product; qty: number }>();
      for (let l = 0; l < lineCount; l++) {
        const p = pick(weighted);
        const cur = chosen.get(p.id);
        const addQty = 1 + (rand() < 0.25 ? 1 : 0);
        chosen.set(p.id, { product: p, qty: (cur?.qty ?? 0) + addQty });
      }

      const items: OrderItem[] = [...chosen.values()].map(({ product: p, qty }) => {
        const calc = computeLine({
          price: p.price,
          qty,
          cost: p.cost,
          modifiers: [],
          discountType: 'none',
          discountValue: 0,
        });
        return {
          id: newId('oi'),
          productId: p.id,
          name: p.name,
          unit: p.unit,
          price: p.price,
          cost: p.cost,
          qty,
          modifiers: [],
          discountType: 'none',
          discountValue: 0,
          note: '',
          gross: calc.gross,
          discount: calc.discount,
          total: calc.total,
          refundedQty: 0,
          taxCategory: p.taxCategory ?? 'standard',
          taxRateBp: effectiveTaxRateBp(p.taxCategory, orderType, settings),
        };
      });

      const totals = computeTotals({
        items,
        discountType: 'none',
        discountValue: 0,
        serviceChargeRate: settings.serviceChargeRate,
        taxMode: settings.taxMode,
        taxRate: settings.taxRate,
        taxRates: settings.taxRates,
        taxRounding: settings.taxRounding,
        orderType,
        eatInRule: settings.eatInRule,
        roundTo: settings.roundTo,
      });

      const method = pick(methods);
      const isDebtOrder = back === 2 && idx === 0;
      const partialPaid = isDebtOrder ? Math.floor(totals.total / 2) : totals.total;
      const tenderStep = settings.currency === 'JPY' ? 1000 : settings.roundTo > 1 ? settings.roundTo * 10 : 0;
      const tendered =
        !isDebtOrder && method === 'cash' && tenderStep > 1 && totals.total > 0
          ? Math.ceil(totals.total / tenderStep) * tenderStep
          : partialPaid;

      const order: Order = {
        id: newId('o'),
        code: formatCode(settings.orderPrefix, seq++, new Date(at), '01'),
        type: orderType,
        status: 'paid',
        tableId: null,
        tableName: '',
        guests: orderType === 'dine_in' ? 1 + Math.floor(rand() * 3) : 1,
        customerId: isDebtOrder ? updatedCustomer.id : null,
        customerName: isDebtOrder ? updatedCustomer.name : '',
        items,
        subtotal: totals.subtotal,
        discountType: 'none',
        discountValue: 0,
        discount: totals.discount,
        serviceCharge: totals.serviceCharge,
        taxMode: settings.taxMode,
        taxRate: settings.taxRate,
        tax: totals.tax,
        taxLines: totals.taxLines,
        rounding: totals.rounding,
        total: totals.total,
        cogs: totals.cogs,
        paidAmount: tendered,
        changeAmount: isDebtOrder ? 0 : Math.max(0, tendered - totals.total),
        dueAmount: isDebtOrder ? Math.max(0, totals.total - tendered) : 0,
        payments: tendered > 0 ? [{ id: newId('pay'), method, amount: tendered, ref: '', at }] : [],
        refunds: [],
        refundedAmount: 0,
        pointsEarned: 0,
        pointsUsed: 0,
        pointsValue: 0,
        note: '',
        userId: owner.id,
        userName: owner.name,
        shiftId: null,
        createdAt: at,
        updatedAt: at,
        paidAt: at,
        voidedAt: 0,
        voidReason: '',
      };

      if (isDebtOrder) {
        updatedCustomer.debt += order.dueAmount;
        updatedCustomer.totalSpent += order.total;
        updatedCustomer.orderCount += 1;
      } else if ((back === 5 || back === 1) && idx === 0 && items[0].qty >= 1 && order.total > 0) {
        // 一部返品・返金のサンプル伝票を組み込む
        const refItem = items[0];
        const refQty = 1;
        const refAmt = Math.min(order.total, Math.round(refItem.total / refItem.qty));
        refItem.refundedQty = refQty;
        order.refundedAmount = refAmt;
        order.status = refAmt >= order.total ? 'refunded' : 'paid';
        if (refAmt > 0 && order.status === 'paid') order.status = 'refunded';
        order.refunds.push({
          id: newId('rf'),
          at: at + 15 * 60_000,
          amount: refAmt,
          reason: settings.lang === 'ja' ? '数量違いによる一部返品' : 'Partial return',
          method: 'cash',
          userId: owner.id,
          shiftId: null,
          items: [{ itemId: refItem.id, qty: refQty, amount: refAmt }],
          restock: true,
        });
      }

      out.push(order);
    }
  }

  return { orders: out, debtCustomer: updatedCustomer };
}
