import { db } from '@/db/db';
import { newId } from '@/core/id';
import { normaliseQty } from '@/core/money';
import type { Product, StockMoveType, StockMovement, User } from '@/db/types';

export interface StockChange {
  productId: string;
  /** 符号付き変動数（負数で出庫・減算、正数で入庫・加算）。 */
  delta: number;
  type: StockMoveType;
  cost?: number;
  refType?: string;
  refId?: string;
  note?: string;
}

/** 在庫増減と在庫移動履歴を書き込む。外部トランザクション内からも安全に呼び出せる。 */
export async function applyStockChanges(changes: StockChange[], user: User | null): Promise<void> {
  const real = changes.filter((c) => c.delta !== 0);
  if (!real.length) return;

  const ids = [...new Set(real.map((c) => c.productId))];
  const products = await db.products.bulkGet(ids);
  const byId = new Map<string, Product>();
  products.forEach((p) => {
    if (p) byId.set(p.id, p);
  });

  const movements: StockMovement[] = [];
  const updates: Product[] = [];
  const now = Date.now();

  for (const change of real) {
    const product = byId.get(change.productId);
    if (!product || !product.trackStock || product.isService) continue;
    const before = product.stock;
    const after = normaliseQty(before + change.delta);
    const updated: Product = { ...product, stock: after, updatedAt: now };
    byId.set(product.id, updated);
    updates.push(updated);
    movements.push({
      id: newId('sm'),
      productId: product.id,
      productName: product.name,
      type: change.type,
      qty: normaliseQty(change.delta),
      before,
      after,
      cost: change.cost ?? product.cost,
      refType: change.refType ?? '',
      refId: change.refId ?? '',
      note: change.note ?? '',
      userId: user?.id ?? '',
      userName: user?.name ?? '',
      at: now,
    });
  }

  if (updates.length) {
      // 同一商品が重複する場合は後勝ちとなるよう事前に合算する
    const final = new Map(updates.map((p) => [p.id, p]));
    await db.products.bulkPut([...final.values()]);
  }
  if (movements.length) await db.stockMovements.bulkAdd(movements);
}

/** 棚卸処理: 実査数量を現在庫として反映し差分を記録する。 */
export async function setStockLevel(
  productId: string,
  countedQty: number,
  user: User | null,
  note = '',
): Promise<void> {
  await db.transaction('rw', [db.products, db.stockMovements], async () => {
    const product = await db.products.get(productId);
    if (!product) return;
    const delta = normaliseQty(countedQty - product.stock);
    if (delta === 0) return;
    await applyStockChanges(
      [{ productId, delta, type: 'adjust', note, refType: 'stocktake' }],
      user,
    );
  });
}

export interface StockSummary {
  totalValue: number;
  totalRetail: number;
  lowStock: Product[];
  outOfStock: Product[];
  trackedCount: number;
}

export function summariseStock(products: Product[]): StockSummary {
  const tracked = products.filter((p) => p.trackStock && !p.isService && p.active);
  return {
    totalValue: tracked.reduce((s, p) => s + Math.round(p.cost * p.stock), 0),
    totalRetail: tracked.reduce((s, p) => s + Math.round(p.price * p.stock), 0),
    lowStock: tracked.filter((p) => p.stock > 0 && p.minStock > 0 && p.stock <= p.minStock),
    outOfStock: tracked.filter((p) => p.stock <= 0),
    trackedCount: tracked.length,
  };
}
