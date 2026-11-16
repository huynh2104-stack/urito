import { db } from '@/db/db';
import { normaliseQty } from '@/core/money';
import { useCart } from '@/store/cart';
import { useLiveQuery } from './useLiveQuery';

/** 保留中の伝票・着席中テーブルが仮押さえしている在庫数を集計する（指定IDを除く）。 */
export async function reservedByOpenOrders(excludeOrderId: string | null): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  await db.orders
    .where('status')
    .equals('open')
    .each((o) => {
      if (o.id === excludeOrderId) return;
      for (const i of o.items) map.set(i.productId, normaliseQty((map.get(i.productId) ?? 0) + i.qty));
    });
  return map;
}

/** 他伝票の仮押さえ在庫をリアルタイムに監視するフック。 */
export function useReserved(): Map<string, number> {
  const orderId = useCart((s) => s.orderId);
  return useLiveQuery(() => reservedByOpenOrders(orderId), [orderId], new Map<string, number>());
}
