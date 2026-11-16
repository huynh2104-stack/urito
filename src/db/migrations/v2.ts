import type { MigrationDef } from './types';

function extractTrailingSeq(code: string | undefined): number {
  if (!code) return 0;
  const m = code.match(/(\d+)$/);
  return m ? Number(m[1]) || 0 : 0;
}

function randomDeviceNo(): string {
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const b = new Uint8Array(2);
    crypto.getRandomValues(b);
    return chars[b[0] % chars.length] + chars[b[1] % chars.length];
  }
  return '01';
}

/** スキーマ v2：
 *  - boolean や未使用インデックスを削除し、[status+tableId] 複合インデックスを追加（C-07）
 *  - kv に各伝票の連番カウンター（seq.*）と端末番号（device.no）を初期化する（B-03） */
export const v2Migration: MigrationDef = {
  version: 2,
  stores: {
    settings: 'id',
    users: 'id, name, role',
    categories: 'id, name',
    modifierGroups: 'id, name',
    products: 'id, name, sku, barcode, categoryId',
    customers: 'id, name, phone, code',
    suppliers: 'id, name, phone',
    areas: 'id',
    diningTables: 'id, areaId',
    orders: 'id, code, status, type, createdAt, paidAt, customerId, shiftId, userId, tableId, [status+tableId]',
    stockMovements: 'id, productId, type, at, refId',
    purchases: 'id, code, supplierId, status, createdAt',
    shifts: 'id, code, userId, status, openedAt, closedAt',
    cashMovements: 'id, shiftId, type, at',
    expenses: 'id, category, at, shiftId',
    promotions: 'id, code',
    kv: 'key',
  },
  async upgrade(tx) {
    const kv = tx.table<{ key: string; value: unknown }, string>('kv');

    const settingsRow = await tx.table<{ id: string; nextOrderNo?: number }, string>('settings').get('app');
    const orders = await tx.table<{ code?: string }, string>('orders').toArray();
    const shifts = await tx.table<{ code?: string }, string>('shifts').toArray();
    const purchases = await tx.table<{ code?: string }, string>('purchases').toArray();
    const customers = await tx.table<{ code?: string }, string>('customers').toArray();
    const products = await tx.table<{ sku?: string }, string>('products').toArray();

    const maxFrom = (list: number[]) => list.reduce((m, n) => (n > m ? n : m), 0);

    const orderMax = Math.max(
      Math.max(0, (settingsRow?.nextOrderNo ?? 1) - 1),
      maxFrom(orders.map((o) => extractTrailingSeq(o.code))),
    );
    const shiftMax = maxFrom(shifts.map((s) => extractTrailingSeq(s.code)));
    const purchaseMax = maxFrom(purchases.map((p) => extractTrailingSeq(p.code)));
    const customerMax = maxFrom(customers.map((c) => extractTrailingSeq(c.code)));
    const skuMax = maxFrom(products.map((p) => extractTrailingSeq(p.sku)));

    const defaults: [string, unknown][] = [
      ['seq.order', orderMax],
      ['seq.shift', shiftMax],
      ['seq.purchase', purchaseMax],
      ['seq.customer', customerMax],
      ['seq.sku', skuMax],
      ['device.no', randomDeviceNo()],
    ];

    for (const [key, value] of defaults) {
      const existing = await kv.get(key);
      if (existing === undefined) {
        await kv.put({ key, value });
      }
    }
  },
};
