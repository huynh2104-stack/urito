import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { defaultOwner, defaultSettings } from '@/db/defaults';
import { useApp } from '@/store/app';
import { useCart } from '@/store/cart';
import { payOrder } from '@/services/orders';
import type { Product } from '@/db/types';

function makeProduct(): Product {
  return {
    id: 'p1',
    sku: 'SP0001',
    barcode: '',
    name: 'Test Item',
    categoryId: '',
    price: 1000,
    cost: 500,
    unit: '個',
    trackStock: false,
    stock: 0,
    minStock: 0,
    isService: false,
    active: true,
    color: '#0ea5e9',
    image: '',
    modifierGroupIds: [],
    favorite: false,
    sort: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('原子的連番採番と排他的設定更新 (B-03)', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((t) => t.clear()));
    const settings = { ...defaultSettings('ja', 'JPY'), onboarded: true };
    await db.settings.put(settings);
    await db.kv.put({ key: 'device.no', value: 'A1' });
    await db.kv.put({ key: 'seq.order', value: 0 });
    await db.products.put(makeProduct());
    useApp.setState({ settings, ready: true, user: defaultOwner('店主'), users: [], shift: null });
  });

  it('50回のpayOrderとupdateSettingsを交互・並行実行しても伝票番号が重複せず設定変更も失われない', async () => {
    const user = useApp.getState().user!;
    const codes: string[] = [];

    for (let i = 0; i < 50; i++) {
      useCart.getState().clear();
      useCart.getState().addProduct(makeProduct(), { qty: 1 });
      const cart = useCart.getState();

      const [order] = await Promise.all([
        payOrder({
          cart,
          ctx: { user, settings: useApp.getState().settings, shiftId: null },
          payments: [{ method: 'cash', amount: 1000 }],
          allowDebt: false,
        }),
        useApp.getState().updateSettings((cur) => ({
          shopName: `店舗${i}`,
          backup: { ...cur.backup, keep: 20 + (i % 5) },
        })),
      ]);
      codes.push(order.code);
    }

    expect(new Set(codes).size).toBe(50);
    expect(codes[0]).toMatch(/^ORD[A-Z0-9]+-\d{6}-0001$/);
    expect(codes[49]).toMatch(/^ORD[A-Z0-9]+-\d{6}-0050$/);
    const saved = await db.settings.get('app');
    expect(saved?.shopName).toBe('店舗49');
    expect(saved?.backup.keep).toBe(20 + (49 % 5));
  });
});
