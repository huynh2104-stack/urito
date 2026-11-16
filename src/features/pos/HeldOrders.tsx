import { Button, EmptyState, Modal } from '@/components/ui';
import { db } from '@/db/db';
import { useLiveQuery } from '@/lib/useLiveQuery';
import { useNow } from '@/lib/useNow';
import { formatDuration, formatTime } from '@/core/date';
import { useApp, useMoney, useT } from '@/store/app';
import { useCart } from '@/store/cart';
import { confirmDialog, toast } from '@/store/ui';
import { deleteOpenOrder } from '@/services/orders';
import type { Order } from '@/db/types';

export function HeldOrdersModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const money = useMoney();
  const lang = useApp((s) => s.settings.lang);
  const cart = useCart();
  const now = useNow();

  const orders = useLiveQuery(
    async () => (await db.orders.where('status').equals('open').toArray()).sort((a, b) => a.createdAt - b.createdAt),
    [],
    [] as Order[],
  );

  const resume = (order: Order) => {
    if (cart.items.length && cart.orderId !== order.id) {
      void confirmDialog({
        title: t('pos.resume'),
        message: t('pos.clearCartConfirm'),
        confirmLabel: t('common.confirm'),
        cancelLabel: t('common.cancel'),
      }).then((ok) => {
        if (ok) {
          useCart.getState().loadOrder(order);
          onClose();
        }
      });
      return;
    }
    useCart.getState().loadOrder(order);
    onClose();
  };

  const remove = async (order: Order) => {
    const ok = await confirmDialog({
      title: t('common.delete'),
      message: t('common.cannotUndo'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!ok) return;
    await deleteOpenOrder(order.id);
    if (useCart.getState().orderId === order.id) useCart.getState().clear();
    toast.success(t('common.deleted'));
  };

  return (
    <Modal open onClose={onClose} title={t('pos.heldOrders')} size="lg">
      {orders.length === 0 ? (
        <EmptyState icon="clock" title={t('pos.noHeldOrders')} />
      ) : (
        <div className="card">
          {orders.map((order) => (
            <div key={order.id} className="list-row">
              <div className="grow">
                <div className="strong">
                  {order.tableName || t('pos.retail')}
                  {order.customerName ? ` · ${order.customerName}` : ''}
                </div>
                <div className="tiny dim">
                  {formatTime(order.createdAt, lang)} · {formatDuration(now - order.createdAt, lang)} ·{' '}
                  {t('orders.itemsCount', { n: order.items.length })}
                </div>
              </div>
              <div className="num strong">{money(order.total)}</div>
              <Button size="sm" variant="primary" onClick={() => resume(order)}>
                {t('pos.resume')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon="trash"
                aria-label={t('common.delete')}
                onClick={() => void remove(order)}
              />
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
