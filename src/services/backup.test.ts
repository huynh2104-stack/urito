import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { createSnapshot, mergeSnapshot, type Snapshot } from './backup';
import type { Customer, Order, Product, StockMovement } from '@/db/types';

const now = Date.now();

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p1', sku: '', barcode: '', name: 'Coca', categoryId: '', price: 12000, cost: 9000, unit: '',
  trackStock: true, stock: 10, minStock: 0, isService: false, active: true, color: '', image: '',
  modifierGroupIds: [], favorite: false, sort: 0, createdAt: now, updatedAt: now, ...over,
});

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: 'c1', code: 'KH1', name: 'An', phone: '', address: '', note: '', points: 5, debt: 0,
  totalSpent: 0, orderCount: 0, birthday: '', active: true, createdAt: now, updatedAt: now, ...over,
});

const order = (over: Partial<Order> = {}): Order => ({
  id: 'o1', code: 'HD-0001', type: 'retail', status: 'paid', tableId: null, tableName: '', guests: 1,
  customerId: null, customerName: '', items: [], subtotal: 36000, discountType: 'none', discountValue: 0,
  discount: 0, serviceCharge: 0, taxMode: 'none', taxRate: 0, tax: 0, rounding: 0, total: 36000,
  cogs: 27000, paidAmount: 36000, changeAmount: 0, dueAmount: 0, payments: [], refunds: [],
  refundedAmount: 0, pointsEarned: 0, pointsUsed: 0, pointsValue: 0, note: '', userId: '', userName: '',
  shiftId: null, createdAt: now, updatedAt: now, paidAt: now, voidedAt: 0, voidReason: '', ...over,
});

const movement = (over: Partial<StockMovement> = {}): StockMovement => ({
  id: 'm1', productId: 'p1', productName: 'Coca', type: 'sale', qty: -3, before: 10, after: 7,
  cost: 9000, refType: 'order', refId: 'o1', note: '', userId: '', userName: '', at: now, ...over,
});

/** What a phone that started from this computer's backup looks like after
 *  selling during a power cut: same catalogue, one extra sale. */
async function phoneSnapshotWithOneSale(): Promise<Snapshot> {
  const snap = await createSnapshot('test');
  const clone: Snapshot = JSON.parse(JSON.stringify(snap));
  clone.data.orders.push(
    order({ id: 'o-phone', code: 'HD-0001', customerId: 'c1', total: 24000, pointsEarned: 2, dueAmount: 4000 }),
  );
  clone.data.stockMovements.push(movement({ id: 'm-phone', qty: -2, refId: 'o-phone' }));
  clone.data.products.push(product({ id: 'p-new', name: 'Pepsi', stock: 50 }));
  return clone;
}

describe('mergeSnapshot', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.products.put(product());
    await db.customers.put(customer());
    await db.orders.put(order());
    await db.stockMovements.put(movement());
  });

  it('adds only records this device does not have', async () => {
    const result = await mergeSnapshot(await phoneSnapshotWithOneSale());
    expect(result.added.orders).toBe(1);
    expect(result.added.products).toBe(1);
    expect(await db.orders.count()).toBe(2);
    expect(await db.products.count()).toBe(2);
  });

  it('replays the phone stock movements onto existing products', async () => {
    await mergeSnapshot(await phoneSnapshotWithOneSale());
    expect((await db.products.get('p1'))!.stock).toBe(8); // 10 - 2 sold on the phone
    expect((await db.products.get('p-new'))!.stock).toBe(50); // new product taken as-is
  });

  it('applies the imported sale to the customer', async () => {
    await mergeSnapshot(await phoneSnapshotWithOneSale());
    const c = (await db.customers.get('c1'))!;
    expect(c.orderCount).toBe(1);
    expect(c.totalSpent).toBe(24000);
    expect(c.points).toBe(7);
    expect(c.debt).toBe(4000);
  });

  it('renames an invoice number that clashes with a local one', async () => {
    const result = await mergeSnapshot(await phoneSnapshotWithOneSale());
    expect(result.renamedCodes).toBe(1);
    expect((await db.orders.get('o-phone'))!.code).toBe('HD-0001-M');
  });

  it('is idempotent: merging the same file twice changes nothing more', async () => {
    const snap = await phoneSnapshotWithOneSale();
    await mergeSnapshot(snap);
    const second = await mergeSnapshot(snap);
    expect(second.added.orders).toBe(0);
    expect((await db.products.get('p1'))!.stock).toBe(8);
    expect((await db.customers.get('c1'))!.orderCount).toBe(1);
  });

  it('never touches local settings', async () => {
    await db.settings.put({ id: 'app', shopName: 'PC' } as never);
    const snap = await phoneSnapshotWithOneSale();
    snap.data.settings = [{ id: 'app', shopName: 'Phone' }];
    await mergeSnapshot(snap);
    expect((await db.settings.get('app'))!.shopName).toBe('PC');
  });
});
