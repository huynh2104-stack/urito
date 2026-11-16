import { useEffect, useRef, useState, type RefObject } from 'react';
import { db } from '@/db/db';

/** C-01: ObjectURL を最大300件保持し、溢れた最古エントリを revokeObjectURL する LRU キャッシュ。 */
export class LruUrlCache {
  private map = new Map<string, string>();

  constructor(
    private readonly maxEntries = 300,
    private readonly revokeFn: (url: string) => void = (u) => {
      if (typeof URL !== 'undefined' && URL.revokeObjectURL) URL.revokeObjectURL(u);
    },
  ) {}

  get size(): number {
    return this.map.size;
  }

  get(key: string): string | undefined {
    const val = this.map.get(key);
    if (val === undefined) return undefined;
    // アクセス時に末尾へ移動してLRU順序を維持する
    this.map.delete(key);
    this.map.set(key, val);
    return val;
  }

  set(key: string, url: string): void {
    const prev = this.map.get(key);
    if (prev !== undefined) {
      this.map.delete(key);
      if (prev !== url) this.revokeFn(prev);
    }
    this.map.set(key, url);
    while (this.map.size > this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey === undefined) break;
      const oldestUrl = this.map.get(oldestKey);
      this.map.delete(oldestKey);
      if (oldestUrl) this.revokeFn(oldestUrl);
    }
  }

  deleteByPrefix(prefix: string): void {
    for (const key of [...this.map.keys()]) {
      if (!key.startsWith(prefix)) continue;
      const url = this.map.get(key);
      this.map.delete(key);
      if (url) this.revokeFn(url);
    }
  }

  clear(): void {
    for (const url of this.map.values()) this.revokeFn(url);
    this.map.clear();
  }
}

const thumbCache = new LruUrlCache(300);

export function invalidateProductThumb(productId: string): void {
  thumbCache.deleteByPrefix(`${productId}:`);
}

type ObserverCallback = () => void;
const listeners = new WeakMap<Element, ObserverCallback>();
let sharedObserver: IntersectionObserver | null = null;

function getSharedObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const cb = listeners.get(entry.target);
          if (cb) {
            listeners.delete(entry.target);
            sharedObserver?.unobserve(entry.target);
            cb();
          }
        }
      },
      { rootMargin: '240px' },
    );
  }
  return sharedObserver;
}

/** C-01: 可視領域に入ったタイミングで productImages テーブルからサムネイルを読み込むフック。 */
export function useThumb(
  productId: string | undefined,
  rev: number | undefined,
  legacyImage?: string,
): { ref: RefObject<HTMLSpanElement | null>; src: string | undefined } {
  const ref = useRef<HTMLSpanElement | null>(null);
  const cacheKey = productId && rev ? `${productId}:${rev}` : '';
  const [resolved, setResolved] = useState<{ key: string; url: string } | null>(null);

  useEffect(() => {
    if (legacyImage || !productId || !rev || !cacheKey) return;
    const hit = thumbCache.get(cacheKey);
    if (hit) {
      queueMicrotask(() => setResolved({ key: cacheKey, url: hit }));
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const row = await db.productImages.get(productId);
        if (cancelled || !row) return;
        const url = URL.createObjectURL(new Blob([row.bytes], { type: row.mime }));
        thumbCache.set(cacheKey, url);
        if (!cancelled) setResolved({ key: cacheKey, url });
      } catch {
        /* 描画用の画像取得失敗はモノグラムフォールバックで吸収する */
      }
    };

    const el = ref.current;
    const io = getSharedObserver();
    if (!el || !io) {
      void load();
      return () => {
        cancelled = true;
      };
    }

    listeners.set(el, () => {
      if (!cancelled) void load();
    });
    io.observe(el);

    return () => {
      cancelled = true;
      listeners.delete(el);
      io.unobserve(el);
    };
  }, [productId, rev, legacyImage, cacheKey]);

  const src = legacyImage || (cacheKey && resolved?.key === cacheKey ? resolved.url : undefined);
  return { ref, src };
}
