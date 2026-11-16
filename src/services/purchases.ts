import { db } from '@/db/db';
import { applyStockChanges } from './inventory';
import type { Purchase, User } from '@/db/types';

/** Receiving a purchase moves stock in and, optionally, refreshes the product
 *  cost so margins in the reports follow the latest buying price. */
export async function receivePurchase(
  purchase: Purchase,
  updateCost: boolean,
  user: User | null,
): Promise<void> {
  await db.transaction('rw', [db.purchases, db.products, db.stockMovements, db.suppliers], async () => {
    const fresh = await db.purchases.get(purchase.id);
    if (!fresh || fresh.status === 'received') return;
    const now = Date.now();

    await applyStockChanges(
      fresh.items.map((item) => ({
        productId: item.productId,
        delta: item.qty,
        type: 'in' as const,
        cost: item.cost,
        refType: 'purchase',
        refId: fresh.id,
        note: fresh.code,
      })),
      user,
    );

    if (updateCost) {
      for (const item of fresh.items) {
        if (item.cost > 0) await db.products.update(item.productId, { cost: item.cost, updatedAt: now });
      }
    }

    await db.purchases.put({ ...fresh, status: 'received', receivedAt: now });

    const owed = fresh.total - fresh.paid;
    if (fresh.supplierId && owed > 0) {
      const supplier = await db.suppliers.get(fresh.supplierId);
      if (supplier) await db.suppliers.update(supplier.id, { debt: supplier.debt + owed });
    }
  });
}
