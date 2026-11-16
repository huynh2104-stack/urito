import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, kvGet, kvSet } from '@/db/db';
import type { Product } from '@/db/types';
import { initCartDraft, useCart } from './cart';

const sampleProduct: Product = {
  id: 'p1',
  sku: 'SKU-0001',
  barcode: '',
  name: 'テスト緑茶',
  categoryId: '',
  price: 150,
  cost: 80,
  unit: '本',
  trackStock: true,
  stock: 20,
  minStock: 0,
  isService: false,
  active: true,
  color: '#000000',
  image: '',
  modifierGroupIds: [],
  favorite: false,
  sort: 0,
  taxCategory: 'reduced',
  createdAt: 0,
  updatedAt: 0,
};

describe('カート下書きの自動保存・24時間有効期限・削除 (B-05)', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    useCart.getState().clear();
  });

  it('保存後24時間以内の下書きデータがある場合は initCartDraft でカートを復元する', async () => {
    const now = 1_700_000_000_000;
    useCart.getState().addProduct(sampleProduct, { qty: 2 });
    const items = useCart.getState().items;
    useCart.getState().clear();

    await kvSet('cart.draft', {
      orderId: null,
      orderCode: '',
      createdAt: 0,
      items,
      type: 'retail',
      tableId: null,
      tableName: '',
      guests: 1,
      customerId: null,
      customerName: '',
      customerPoints: 0,
      discountType: 'none',
      discountValue: 0,
      pointsUsed: 0,
      note: 'メモテスト',
      promotionId: null,
      promotionName: '',
      savedAt: now - 3_600_000, // 1時間前
    });

    const restored = await initCartDraft(now);
    expect(restored).toBe(true);
    expect(useCart.getState().items).toHaveLength(1);
    expect(useCart.getState().items[0].qty).toBe(2);
    expect(useCart.getState().note).toBe('メモテスト');
  });

  it('保存後24時間以上経過した下書きは無視して kv から削除する', async () => {
    const now = 1_700_000_000_000;
    useCart.getState().addProduct(sampleProduct, { qty: 1 });
    const items = useCart.getState().items;
    useCart.getState().clear();

    await kvSet('cart.draft', {
      orderId: null,
      orderCode: '',
      createdAt: 0,
      items,
      type: 'retail',
      tableId: null,
      tableName: '',
      guests: 1,
      customerId: null,
      customerName: '',
      customerPoints: 0,
      discountType: 'none',
      discountValue: 0,
      pointsUsed: 0,
      note: '',
      promotionId: null,
      promotionName: '',
      savedAt: now - 25 * 3_600_000, // 25時間前
    });

    const restored = await initCartDraft(now);
    expect(restored).toBe(false);
    expect(useCart.getState().isEmpty()).toBe(true);
    expect(await kvGet('cart.draft')).toBeUndefined();
  });

  it('clear() 呼び出しで kv["cart.draft"] が削除される', async () => {
    await kvSet('cart.draft', { items: [], savedAt: Date.now() });
    useCart.getState().clear();
    // マイクロタスク上の非同期削除完了を待機
    await new Promise((r) => setTimeout(r, 20));
    expect(await kvGet('cart.draft')).toBeUndefined();
  });
});
