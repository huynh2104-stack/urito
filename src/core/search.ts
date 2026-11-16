import type { Lang, Product } from '@/db/types';

const VN_TONE_RE = /[\u0300-\u036f]/g;
const KATA_RE = /[\u30a1-\u30f6]/g;

/**
 * D-05: 検索文字列の正規化を行う。
 * NFKC で半角カタカナ・全角英数字を標準幅に揃えた上で、カタカナをひらがなへ統合し、
 * さらにベトナム語の声調記号を除去して高速検索を可能にする。
 */
export function normaliseText(input: string): string {
  if (!input) return '';
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(KATA_RE, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .normalize('NFD')
    .replace(VN_TONE_RE, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
}

/** D-05: SKU・バーコード照合用の正規化（全角英数字や半角記号の揺れを NFKC で統一する）。 */
export function normaliseCode(input: string): string {
  return input.normalize('NFKC').trim().toLowerCase();
}

/** D-05: 商品が検索語に一致するか判定する（商品名・よみがな・SKU・バーコードを横断）。 */
export function matchesProduct(p: Product, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  const q = normaliseText(trimmed);
  const codeQ = normaliseCode(trimmed);
  if (normaliseText(p.name).includes(q)) return true;
  if (p.kana && normaliseText(p.kana).includes(q)) return true;
  if (p.sku && normaliseCode(p.sku).includes(codeQ)) return true;
  if (p.barcode && normaliseCode(p.barcode).includes(codeQ)) return true;
  return false;
}

const collators = new Map<string, Intl.Collator>();
function getCollator(lang: Lang): Intl.Collator {
  const locale = lang === 'ja' ? 'ja' : lang === 'vi' ? 'vi' : 'en';
  let hit = collators.get(locale);
  if (!hit) {
    hit = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
    collators.set(locale, hit);
  }
  return hit;
}

/** D-05: 日本語表示時はよみがな（kana）優先・五十音順で並べ替える。 */
export function compareProductNames(a: Product, b: Product, lang: Lang): number {
  const col = getCollator(lang);
  const ka = lang === 'ja' ? a.kana?.trim() || a.name : a.name;
  const kb = lang === 'ja' ? b.kana?.trim() || b.name : b.name;
  return col.compare(ka, kb);
}

/** ロケールに応じた自然順文字列比較を行う。 */
export function compareStrings(a: string, b: string, lang: Lang): number {
  return getCollator(lang).compare(a, b);
}

export interface IndexedProduct {
  product: Product;
  key: string;
}

export interface ProductSearchIndex {
  entries: IndexedProduct[];
  byBarcode: Map<string, Product>;
  bySku: Map<string, Product>;
}

/** C-03: 商品リスト変更時に1度だけ検索キーとコードMapを構築し、入力ごとの全件正規化を排除する。 */
export function buildProductSearchIndex(products: Product[]): ProductSearchIndex {
  const byBarcode = new Map<string, Product>();
  const bySku = new Map<string, Product>();
  const entries = products.map((product) => {
    if (product.barcode) byBarcode.set(normaliseCode(product.barcode), product);
    if (product.sku) bySku.set(normaliseCode(product.sku), product);
    const key = [
      normaliseText(product.name),
      product.kana ? normaliseText(product.kana) : '',
      product.sku ? normaliseCode(product.sku) : '',
      product.barcode ? normaliseCode(product.barcode) : '',
    ]
      .filter(Boolean)
      .join('\t');
    return { product, key };
  });
  return { entries, byBarcode, bySku };
}

/** C-03: 事前構築済みインデックスを用いて即時検索を実行する。 */
export function searchIndexedProducts(index: ProductSearchIndex, query: string): Product[] {
  const trimmed = query.trim();
  if (!trimmed) return index.entries.map((e) => e.product);
  const q = normaliseText(trimmed);
  return index.entries.filter((e) => e.key.includes(q)).map((e) => e.product);
}
