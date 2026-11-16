import { useLiveQuery } from './useLiveQuery';
import { reservedByOpenOrders } from '@/services/orders';
import { useCart } from '@/store/cart';

/** Stock promised to other parked tickets (excludes the ticket being edited). */
export function useReserved(): Map<string, number> {
  const orderId = useCart((s) => s.orderId);
  return useLiveQuery(() => reservedByOpenOrders(orderId), [orderId], new Map<string, number>());
}
