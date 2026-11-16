import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { defaultOwner, defaultSettings } from '@/db/defaults';
import { useCart } from '@/store/cart';
import { holdOrder, payOrder, reservedByOpenOrders, StockError } from './orders';
import type { Product } from '@/db/types';

function product(stock: number): Product {
  return {
    id: 'p1', sku: 'A', barcode: '', name: 'A', categoryId: '', price: 1000, cost: 500, unit: '',
    trackStock: true, stock, minStock: 0, isService: false, active: true, color: '#000000', image: '',
    modifierGroupIds: [], favorite: false, sort: 0, createdAt: 0, updatedAt: 0,
  };
}

describe('stock guard when selling below zero is off', () => {
  const settings = { ...defaultSettings(), negativeStock: false };
  const user = defaultOwner('Owner');
  const ctx = { user, settings, shiftId: null };

  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.settings.put(settings);
    await db.products.put(product(4));
    useCart.getState().clear();
  });

  const fill = (qty: number) => {
    useCart.getState().clear();
    useCart.getState().addProduct(product(4), { qty });
  };

  it('a parked ticket reserves stock, and paying another 4 is refused', async () => {
    fill(4);
    await holdOrder(useCart.getState(), ctx);
    expect((await reservedByOpenOrders(null)).get('p1')).toBe(4);

    fill(4);
    await expect(
      payOrder({ cart: useCart.getState(), ctx, payments: [{ method: 'cash', amount: 4000 }], allowDebt: false }),
    ).rejects.toBeInstanceOf(StockError);
    expect((await db.products.get('p1'))!.stock).toBe(4);
  });

  it('the parked ticket itself can still be paid', async () => {
    fill(4);
    const held = await holdOrder(useCart.getState(), ctx);
    useCart.getState().clear();
    useCart.getState().loadOrder(held);
    await payOrder({ cart: useCart.getState(), ctx, payments: [{ method: 'cash', amount: 4000 }], allowDebt: false });
    expect((await db.products.get('p1'))!.stock).toBe(0);
  });

  it('a reopened ticket cannot be paid once the stock is gone', async () => {
    fill(4);
    const held = await holdOrder(useCart.getState(), ctx);
    await db.products.update('p1', { stock: 0 }); // e.g. stock adjusted after a count
    useCart.getState().clear();
    useCart.getState().loadOrder(held);
    await expect(
      payOrder({ cart: useCart.getState(), ctx, payments: [{ method: 'cash', amount: 4000 }], allowDebt: false }),
    ).rejects.toBeInstanceOf(StockError);
  });
});
