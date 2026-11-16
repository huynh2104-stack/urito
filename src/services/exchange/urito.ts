import { CURRENCIES, formatAmount, parseMoney } from '@/core/money';
import { normaliseText } from '@/core/search';
import type { Product } from '@/db/types';
import type { ExchangeExportContext, ExchangeImportContext, ExchangeProductRow } from './types';

/** 一般的なPOS・Urito独自CSV列名の認識マップ。 */
const URITO_HEADERS: Record<string, string[]> = {
  sku: ['ma hang hoa', 'ma hang', 'ma sp', 'ma san pham', 'sku', 'code', '商品コード'],
  name: ['ten hang hoa', 'ten hang', 'ten san pham', 'ten', 'name', 'product name', '商品名'],
  category: ['ten nhom', 'nhom hang', 'nhom', 'category', 'カテゴリー', 'カテゴリ'],
  unit: ['dvt', 'don vi', 'unit', '単位'],
  price: ['gia ban', 'gia', 'price', '販売価格', '売価'],
  cost: ['gia von', 'von', 'cost', '原価'],
  stock: ['ton kho', 'ton', 'stock', '在庫数'],
  minStock: ['dinh muc ton nho nhat', 'ton toi thieu', 'min stock', '最小在庫'],
  barcode: ['ma vach', 'barcode', 'バーコード', 'jan'],
  image: ['hinh anh', 'anh', 'image', '画像'],
  kind: ['loai hang'],
  blocked: ['khong cho phep ban'],
};

const norm = (s: string) => normaliseText(s).replace(/[?:]/g, '').replace(/\s+/g, ' ').trim();

function mapColumns(head: string[]): Record<string, number> {
  const found: Record<string, number> = {};
  head.forEach((h, i) => {
    const key = norm(h ?? '');
    for (const [field, names] of Object.entries(URITO_HEADERS)) {
      if (found[field] === undefined && names.includes(key)) found[field] = i;
    }
  });
  return found;
}

/** Urito 標準CSVエクスポート配列を生成する。 */
export function exportUritoCsv(
  products: Product[],
  ctx: ExchangeExportContext,
  headers: string[],
): (string | number)[][] {
  const formatNum = (minor: number) =>
    CURRENCIES[ctx.currency].decimals === 0 ? String(minor) : formatAmount(minor, ctx.currency, 'en');
  return [
    headers,
    ...products.map((p) => [
      p.name,
      formatNum(p.price),
      formatNum(p.cost),
      ctx.categoryNames.get(p.categoryId) ?? '',
      p.sku,
      p.barcode,
      p.stock,
      p.unit,
      p.minStock,
    ]),
  ];
}

/** Urito / 各種POSスプレッドシート（CSV/XLSX展開配列）を正規化取込行に変換する。 */
export function parseUritoProductTable(table: string[][], ctx: ExchangeImportContext): ExchangeProductRow[] {
  if (!table.length) return [];
  const [head, ...body] = table;
  const cols = mapColumns(head);
  const num = (v: string | undefined) => Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  const money = (v: string | undefined) => parseMoney(String(v ?? '0'), ctx.currency);

  if (cols.name !== undefined) {
    const cell = (c: string[], f: string) => (cols[f] === undefined ? '' : String(c[cols[f]] ?? '').trim());
    return body
      .map((c): ExchangeProductRow => {
        const image = cell(c, 'image');
        return {
          sku: cell(c, 'sku'),
          name: cell(c, 'name'),
          category: cell(c, 'category'),
          unit: cell(c, 'unit'),
          price: money(cell(c, 'price')),
          cost: money(cell(c, 'cost')),
          stock: cols.stock === undefined ? null : Number.isFinite(num(cell(c, 'stock'))) ? num(cell(c, 'stock')) : 0,
          minStock: cols.minStock === undefined ? null : Math.max(0, num(cell(c, 'minStock')) || 0),
          barcode: cell(c, 'barcode'),
          image: /^(https?:|data:image)/i.test(image) ? image : '',
          taxable: true,
          isService: cell(c, 'kind') === '2',
          active: cell(c, 'blocked') !== '1',
        };
      })
      .filter((r) => Boolean(r.name));
  }

  // ヘッダーなし・簡易形式: name, price, cost, category, sku, barcode, stock
  const looksLikeHeader = head.some((c) => /name|tên|商品|price|giá|価格/i.test(c));
  const data = looksLikeHeader ? body : table;
  return data
    .map(
      (c): ExchangeProductRow => ({
        name: (c[0] ?? '').trim(),
        price: money(c[1]),
        cost: money(c[2]),
        category: (c[3] ?? '').trim(),
        sku: (c[4] ?? '').trim(),
        barcode: (c[5] ?? '').trim(),
        stock: num(c[6]) || 0,
        unit: '',
        minStock: null,
        image: '',
        taxable: true,
        isService: false,
        active: true,
      }),
    )
    .filter((r) => Boolean(r.name));
}
