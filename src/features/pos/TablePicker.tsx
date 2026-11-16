import { useState } from 'react';
import { Button, EmptyState, Modal } from '@/components/ui';
import { db } from '@/db/db';
import { useLiveQuery } from '@/lib/useLiveQuery';
import { useT } from '@/store/app';
import { useCart } from '@/store/cart';
import { navigate } from '@/router';
import { sortTables } from '@/features/tables/TablesPage';
import type { DiningTable, Order } from '@/db/types';

export function TablePickerModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const cart = useCart();
  const [areaId, setAreaId] = useState<string>('all');

  const areas = useLiveQuery(async () => (await db.areas.toArray()).sort((a, b) => a.sort - b.sort), [], []);
  const tables = useLiveQuery(
    async () => sortTables(await db.diningTables.toArray(), await db.areas.toArray()),
    [],
    [] as DiningTable[],
  );
  const openOrders = useLiveQuery(
    async () => db.orders.where('status').equals('open').toArray(),
    [],
    [] as Order[],
  );

  const busyBy = new Map(openOrders.filter((o) => o.tableId).map((o) => [o.tableId as string, o]));
  const visible = areaId === 'all' ? tables : tables.filter((tb) => tb.areaId === areaId);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('pos.selectTable')}
      footer={
        <>
          <Button
            onClick={() => {
              useCart.getState().setTable(null, '');
              onClose();
            }}
          >
            {t('pos.noTable')}
          </Button>
          <span className="grow" />
          <Button onClick={onClose}>{t('common.close')}</Button>
        </>
      }
    >
      {tables.length === 0 ? (
        <EmptyState
          icon="table"
          title={t('tab.noTables')}
          action={
            <Button
              variant="primary"
              onClick={() => {
                navigate('/tables');
                onClose();
              }}
            >
              {t('tab.manage')}
            </Button>
          }
        />
      ) : (
        <div className="col gap-12">
          <div className="row wrap gap-4">
            <button
              type="button"
              className={`chip ${areaId === 'all' ? 'active' : ''}`}
              onClick={() => setAreaId('all')}
            >
              {t('common.all')}
            </button>
            {areas.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`chip ${areaId === a.id ? 'active' : ''}`}
                onClick={() => setAreaId(a.id)}
              >
                {a.name}
              </button>
            ))}
          </div>

          <div className="table-grid">
            {visible.map((table) => {
              const order = busyBy.get(table.id);
              const mine = cart.tableId === table.id;
              return (
                <button
                  key={table.id}
                  type="button"
                  className={`table-tile ${order ? 'busy' : ''}`}
                  style={mine ? { outline: '2px solid var(--c-brand)' } : undefined}
                  onClick={() => {
                    if (order && order.id !== cart.orderId) {
                      useCart.getState().loadOrder(order);
                    } else {
                      useCart.getState().setTable(table.id, table.name);
                    }
                    onClose();
                  }}
                >
                  <span className="table-tile-name">{table.name}</span>
                  <span className="table-tile-meta">
                    {order ? t('tab.occupied') : `${table.seats} ${t('tab.seats')}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}
