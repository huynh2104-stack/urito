import { describe, expect, it } from 'vitest';
import { dataUrlToImageBytes } from './image';
import { LruUrlCache } from './thumbCache';

describe('商品画像LRUキャッシュとDataURL変換 (C-01)', () => {
  it('LruUrlCache は上限を超えると最古のエントリから revokeFn を呼び出して破棄する', () => {
    const revoked: string[] = [];
    const cache = new LruUrlCache(2, (u) => revoked.push(u));

    cache.set('a:1', 'blob:a1');
    cache.set('b:1', 'blob:b1');
    // a:1 を参照して最近使用に昇格させる
    expect(cache.get('a:1')).toBe('blob:a1');
    // c:1 を追加すると b:1 が追い出される
    cache.set('c:1', 'blob:c1');

    expect(cache.size).toBe(2);
    expect(revoked).toEqual(['blob:b1']);
    expect(cache.get('a:1')).toBe('blob:a1');
    expect(cache.get('c:1')).toBe('blob:c1');
  });

  it('deleteByPrefix で同一商品の古いリビジョンを一括破棄できる', () => {
    const revoked: string[] = [];
    const cache = new LruUrlCache(10, (u) => revoked.push(u));
    cache.set('p1:1', 'blob:p1-1');
    cache.set('p1:2', 'blob:p1-2');
    cache.set('p2:1', 'blob:p2-1');

    cache.deleteByPrefix('p1:');
    expect(revoked).toEqual(['blob:p1-1', 'blob:p1-2']);
    expect(cache.size).toBe(1);
  });

  it('dataUrlToImageBytes が base64 DataURL を ArrayBuffer へ正確に復号する', () => {
    const sample = 'data:image/webp;base64,SGVsbG8='; // "Hello" 文字列の Base64 例
    const res = dataUrlToImageBytes(sample, 320);
    expect(res).not.toBeNull();
    expect(res!.mime).toBe('image/webp');
    expect(Array.from(new Uint8Array(res!.bytes))).toEqual([72, 101, 108, 108, 111]);
  });
});
