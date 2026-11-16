import { compareProductNames } from '@/core/search';
import type { Lang, Product } from '@/db/types';

export type SortKey = 'pin' | 'name' | 'priceAsc' | 'priceDesc' | 'sold' | 'stock' | 'newest';
export type TileSize = 's' | 'm' | 'l';

export interface PosView {
  sort: SortKey;
  inStockOnly: boolean;
  size: TileSize;
}

export const DEFAULT_VIEW: PosView = { sort: 'pin', inStockOnly: false, size: 'm' };

const KEY = 'urito.pos.view';
const SORTS: SortKey[] = ['pin', 'name', 'priceAsc', 'priceDesc', 'sold', 'stock', 'newest'];

/** レイアウト設定を端末ごとに保存する（店舗PCとモバイルで好みが異なるため）。 */
export function loadView(): PosView {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<PosView> | null;
    if (!raw) return DEFAULT_VIEW;
    return {
      sort: SORTS.includes(raw.sort as SortKey) ? (raw.sort as SortKey) : DEFAULT_VIEW.sort,
      inStockOnly: !!raw.inStockOnly,
      size: raw.size === 's' || raw.size === 'l' ? raw.size : 'm',
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

export function saveView(view: PosView) {
  try {
    localStorage.setItem(KEY, JSON.stringify(view));
  } catch {
        /* プライベートブラウズ等で保存不可の場合はそのまま無視する */
  }
}

const byManual = (a: Product, b: Product, lang: Lang) => a.sort - b.sort || compareProductNames(a, b, lang);

export function isDefaultView(view: PosView): boolean {
  return view.sort === DEFAULT_VIEW.sort && !view.inStockOnly && view.size === DEFAULT_VIEW.size;
}

export function arrangeProducts(
  list: Product[],
  view: PosView,
  sold: Map<string, number>,
  lang: Lang = 'ja',
): Product[] {
  let out = list;
  if (view.inStockOnly) out = out.filter((p) => !p.trackStock || p.isService || p.stock > 0);
  const copy = [...out];
  switch (view.sort) {
    case 'name':
      return copy.sort((a, b) => compareProductNames(a, b, lang));
    case 'priceAsc':
      return copy.sort((a, b) => a.price - b.price || byManual(a, b, lang));
    case 'priceDesc':
      return copy.sort((a, b) => b.price - a.price || byManual(a, b, lang));
    case 'sold':
      return copy.sort((a, b) => (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0) || byManual(a, b, lang));
    case 'stock':
      // 在庫管理しない商品は在庫切れにならないため在庫少ない順では末尾へ回す
      return copy.sort(
        (a, b) =>
          (a.trackStock && !a.isService ? a.stock : Infinity) - (b.trackStock && !b.isService ? b.stock : Infinity) ||
          byManual(a, b, lang),
      );
    case 'newest':
      return copy.sort((a, b) => b.createdAt - a.createdAt || byManual(a, b, lang));
    case 'pin':
    default:
      return copy.sort((a, b) => Number(b.favorite) - Number(a.favorite) || byManual(a, b, lang));
  }
}
