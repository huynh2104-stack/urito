import { describe, expect, it } from 'vitest';
import type { Product } from '@/db/types';
import {
  buildProductSearchIndex,
  compareProductNames,
  matchesProduct,
  normaliseCode,
  normaliseText,
  searchIndexedProducts,
} from './search';

function prod(over: Partial<Product>): Product {
  return {
    id: 'p1',
    sku: '',
    barcode: '',
    name: '',
    categoryId: '',
    price: 100,
    cost: 50,
    unit: '個',
    trackStock: true,
    stock: 10,
    minStock: 0,
    isService: false,
    active: true,
    color: '#000000',
    image: '',
    modifierGroupIds: [],
    favorite: false,
    sort: 0,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe('日本語かな・NFKC正規化検索とソート (D-05)', () => {
  it('ひらがな・全角カタカナ・半角カタカナのいずれも よみがな(kana) 経由で牛乳に一致する', () => {
    const milk = prod({ name: '牛乳', kana: 'ぎゅうにゅう', sku: 'SKU-0001', barcode: '2000000000019' });
    expect(matchesProduct(milk, 'ぎゅうにゅう')).toBe(true);
    expect(matchesProduct(milk, 'ギュウニュウ')).toBe(true);
    expect(matchesProduct(milk, 'ｷﾞｭｳﾆｭｳ')).toBe(true);
    expect(matchesProduct(milk, '牛乳')).toBe(true);
  });

  it('全角数字で入力されたバーコードやSKUもNFKC正規化により一致する', () => {
    const tea = prod({ name: '緑茶', kana: 'りょくちゃ', sku: 'SKU-0002', barcode: '4901234567894' });
    expect(normaliseCode('４９０１２３４')).toBe('4901234');
    expect(matchesProduct(tea, '４９０１２３４')).toBe(true);
    expect(matchesProduct(tea, 'ＳＫＵ－０００２')).toBe(true);
    expect(matchesProduct(tea, '０００２')).toBe(true);
  });

  it('ベトナム語の声調記号を除去して検索できる（互換性維持）', () => {
    const coffee = prod({ name: 'Cà phê sữa' });
    expect(normaliseText('Cà phê')).toBe('ca phe');
    expect(matchesProduct(coffee, 'ca phe')).toBe(true);
    expect(matchesProduct(coffee, 'Cà Phê')).toBe(true);
  });

  it('日本語ロケールでは よみがな(kana) 順で五十音ソートされる', () => {
    const a = prod({ id: 'a', name: '林檎', kana: 'りんご' });
    const b = prod({ id: 'b', name: '飴', kana: 'あめ' });
    const c = prod({ id: 'c', name: '蜜柑', kana: 'みかん' });
    const sorted = [a, b, c].sort((x, y) => compareProductNames(x, y, 'ja'));
    expect(sorted.map((x) => x.name)).toEqual(['飴', '蜜柑', '林檎']);
  });

  it('事前構築済みインデックス(C-03)でO(1)バーコード照合とかな検索が動作する', () => {
    const p1 = prod({ id: '1', name: '牛乳 1L', kana: 'ぎゅうにゅう', sku: 'SKU-001', barcode: '2000000000019' });
    const p2 = prod({ id: '2', name: '緑茶 525ml', kana: 'りょくちゃ', sku: 'SKU-002', barcode: '2000000000026' });
    const idx = buildProductSearchIndex([p1, p2]);
    expect(idx.byBarcode.get(normaliseCode('２００００００００００１９'))?.id).toBe('1');
    expect(idx.bySku.get(normaliseCode('ｓｋｕ－００２'))?.id).toBe('2');
    expect(searchIndexedProducts(idx, 'ｷﾞｭｳﾆｭｳ').map((p) => p.id)).toEqual(['1']);
  });
});
