import { CURRENCIES } from '@/core/money';
import type { CurrencyCode, Product } from '@/db/types';
import type { ExchangeExportContext, ExchangeImportContext, ExchangeProductRow } from './types';

/** F-01: Shopify 公式商品 CSV v2 互換の固定ヘッダー列。 */
export const SHOPIFY_HEADERS = [
  'Handle',
  'Title',
  'Body (HTML)',
  'Vendor',
  'Product Category',
  'Type',
  'Tags',
  'Published',
  'Option1 Name',
  'Option1 Value',
  'Variant SKU',
  'Variant Grams',
  'Variant Inventory Tracker',
  'Variant Inventory Qty',
  'Variant Inventory Policy',
  'Variant Fulfillment Service',
  'Variant Price',
  'Variant Compare At Price',
  'Variant Requires Shipping',
  'Variant Taxable',
  'Variant Barcode',
  'Image Src',
  'Cost per item',
  'Status',
] as const;

function formatShopifyPrice(minor: number, currency: CurrencyCode): string {
  const decimals = CURRENCIES[currency].decimals;
  if (decimals === 0) return String(Math.round(minor));
  return (minor / 10 ** decimals).toFixed(decimals);
}

/** Shopify CSV は通貨記号なしの標準小数（JPY=整数, USD=小数2桁）を前提とする。 */
export function parseShopifyMoney(raw: string, currency: CurrencyCode): number {
  const cleaned = String(raw ?? '')
    .replace(/[^0-9.-]/g, '')
    .trim();
  if (!cleaned) return 0;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 10 ** CURRENCIES[currency].decimals);
}

function toHandle(p: Product, usedHandles: Set<string>): string {
  const raw = (p.sku || p.i18n?.en?.name || p.id)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = raw || p.id.toLowerCase().replace(/[^a-z0-9-]+/g, '-') || 'item';
  let handle = base;
  let seq = 2;
  while (usedHandles.has(handle)) {
    handle = `${base}-${seq++}`;
  }
  usedHandles.add(handle);
  return handle;
}

/** 商品一覧を Shopify 商品 CSV テーブル形式へ変換する。 */
export function exportShopifyCsv(products: Product[], ctx: ExchangeExportContext): string[][] {
  const usedHandles = new Set<string>();
  const vendor = ctx.shopName?.trim() || 'Urito';
  const rows: string[][] = [[...SHOPIFY_HEADERS]];

  for (const p of products) {
    const cat = ctx.categoryNames.get(p.categoryId) ?? '';
    const tracked = p.trackStock && !p.isService;
    const taxable = (p.taxCategory ?? 'standard') !== 'exempt';
    const desc = p.i18n?.ja?.description ?? p.i18n?.en?.description ?? '';

    rows.push([
      toHandle(p, usedHandles),
      p.name,
      desc,
      vendor,
      cat,
      cat,
      p.favorite ? 'favorite' : '',
      p.active ? 'TRUE' : 'FALSE',
      'Title',
      'Default Title',
      p.sku,
      '0',
      tracked ? 'shopify' : '',
      tracked ? String(p.stock) : '',
      'deny',
      'manual',
      formatShopifyPrice(p.price, ctx.currency),
      '',
      p.isService ? 'FALSE' : 'TRUE',
      taxable ? 'TRUE' : 'FALSE',
      p.barcode,
      p.image && /^https?:\/\//i.test(p.image) ? p.image : '',
      formatShopifyPrice(p.cost, ctx.currency),
      p.active ? 'active' : 'draft',
    ]);
  }
  return rows;
}

/** 先頭行が Shopify 商品 CSV ヘッダーかを判定する。 */
export function isShopifyProductCsv(headers: string[]): boolean {
  const set = new Set(headers.map((h) => h.trim().toLowerCase()));
  return set.has('handle') && (set.has('variant price') || set.has('variant sku') || set.has('title'));
}

/**
 * Shopify CSV を Urito 取込行配列へ変換する。
 * バリエーション行（同一 Handle・Title空）および画像追加専用行の仕様に対応する。
 */
export function parseShopifyProductCsv(table: string[][], ctx: ExchangeImportContext): ExchangeProductRow[] {
  if (table.length < 2) return [];
  const [head, ...body] = table;
  const colIndex = new Map<string, number>();
  head.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    if (key && !colIndex.has(key)) colIndex.set(key, i);
  });

  const cell = (row: string[], name: string): string => {
    const idx = colIndex.get(name.toLowerCase());
    return idx === undefined ? '' : String(row[idx] ?? '').trim();
  };

  interface ParentState {
    title: string;
    description: string;
    category: string;
    published: boolean;
    status: string;
    requiresShipping: boolean;
    firstRowIdx: number | null;
  }

  const parents = new Map<string, ParentState>();
  const out: ExchangeProductRow[] = [];

  for (const r of body) {
    const handle = cell(r, 'handle') || cell(r, 'title');
    if (!handle) continue;

    const rawTitle = cell(r, 'title');
    const rawBody = cell(r, 'body (html)').replace(/<[^>]*>/g, '').trim();
    const rawCat = cell(r, 'type') || cell(r, 'product category');
    const rawPublished = cell(r, 'published').toLowerCase();
    const rawStatus = cell(r, 'status').toLowerCase();
    const rawReqShip = cell(r, 'variant requires shipping').toLowerCase();

    let parent = parents.get(handle);
    if (!parent) {
      parent = {
        title: rawTitle,
        description: rawBody,
        category: rawCat,
        published: rawPublished ? rawPublished === 'true' : true,
        status: rawStatus || 'active',
        requiresShipping: rawReqShip ? rawReqShip !== 'false' : true,
        firstRowIdx: null,
      };
      parents.set(handle, parent);
    } else {
      if (rawTitle) parent.title = rawTitle;
      if (rawBody) parent.description = rawBody;
      if (rawCat) parent.category = rawCat;
      if (rawPublished) parent.published = rawPublished === 'true';
      if (rawStatus) parent.status = rawStatus;
      if (rawReqShip) parent.requiresShipping = rawReqShip !== 'false';
    }

    const opt1 = cell(r, 'option1 value');
    const sku = cell(r, 'variant sku');
    const rawPrice = cell(r, 'variant price');
    const rawCost = cell(r, 'cost per item');
    const rawQty = cell(r, 'variant inventory qty');
    const tracker = cell(r, 'variant inventory tracker');
    const barcode = cell(r, 'variant barcode');
    const rawTaxable = cell(r, 'variant taxable').toLowerCase();
    const rawImage = cell(r, 'image src');
    const image = /^https?:\/\//i.test(rawImage) ? rawImage : '';

    // 追加画像のみの継続行は新規商品とせず親行へ画像のみ補完する
    const isImageOnlyContinuation =
      !rawTitle && !sku && !rawPrice && (!opt1 || opt1.toLowerCase() === 'default title') && Boolean(image);
    if (isImageOnlyContinuation) {
      if (parent.firstRowIdx !== null && !out[parent.firstRowIdx].image) {
        out[parent.firstRowIdx].image = image;
      }
      continue;
    }

    if (!parent.title) continue;
    const isVariant = Boolean(opt1) && opt1.toLowerCase() !== 'default title';
    const name = isVariant ? `${parent.title} (${opt1})` : parent.title;

    const stockNum = rawQty === '' ? null : Number(rawQty);
    const hasTracker = tracker !== '' || stockNum !== null;
    const stock = hasTracker && stockNum !== null && Number.isFinite(stockNum) ? stockNum : null;
    const active = parent.status ? parent.status === 'active' : parent.published;
    const isService = !parent.requiresShipping;
    const taxable = rawTaxable ? rawTaxable === 'true' : true;

    const rowIndex = out.length;
    if (parent.firstRowIdx === null) parent.firstRowIdx = rowIndex;

    out.push({
      sku: sku || (isVariant ? `${handle}-${opt1}`.toUpperCase() : ''),
      name,
      description: parent.description || undefined,
      category: parent.category,
      unit: '',
      price: parseShopifyMoney(rawPrice, ctx.currency),
      cost: parseShopifyMoney(rawCost, ctx.currency),
      stock,
      minStock: null,
      barcode,
      image,
      taxable,
      isService,
      active,
    });
  }

  return out;
}
