import { useMemo, useState } from 'react';
import { Button, EmptyState, Field, Input, Modal, NumberInput, Select, Stat } from '@/components/ui';
import { db } from '@/db/db';
import { useLiveQuery } from '@/lib/useLiveQuery';
import { useNow } from '@/lib/useNow';
import { newId } from '@/core/id';
import { formatDuration } from '@/core/date';
import { useMoney, useT } from '@/store/app';
import { confirmDialog, toast } from '@/store/ui';
import { navigate } from '@/router';
import { useCart } from '@/store/cart';
import type { Area, DiningTable, Order } from '@/db/types';

/** Group tables by their area first, so A1..A6 never interleave with B1..B6. */
export function sortTables(tables: DiningTable[], areas: Area[]): DiningTable[] {
  const order = new Map(areas.map((a, i) => [a.id, a.sort ?? i]));
  return [...tables].sort(
    (a, b) => (order.get(a.areaId) ?? 99) - (order.get(b.areaId) ?? 99) || a.sort - b.sort || a.name.localeCompare(b.name),
  );
}

async function persistTableMove(order: Order, target: DiningTable, existing: Order | undefined): Promise<'merged' | 'moved'> {
  const now = Date.now();
  if (existing) {
    await db.transaction('rw', [db.orders], async () => {
      await db.orders.put({
        ...existing,
        items: [...existing.items, ...order.items],
        subtotal: existing.subtotal + order.subtotal,
        total: existing.total + order.total,
        cogs: existing.cogs + order.cogs,
        guests: existing.guests + order.guests,
        updatedAt: now,
      });
      await db.orders.delete(order.id);
    });
    return 'merged';
  }
  await db.orders.update(order.id, {
    tableId: target.id,
    tableName: target.name,
    updatedAt: now,
  });
  return 'moved';
}

export function TablesPage() {
  const t = useT();
  const money = useMoney();
  const now = useNow();

  const [areaId, setAreaId] = useState('all');
  const [managing, setManaging] = useState(false);
  const [moving, setMoving] = useState<{ order: Order; from: DiningTable } | null>(null);

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

  const orderByTable = useMemo(
    () => new Map(openOrders.filter((o) => o.tableId).map((o) => [o.tableId as string, o])),
    [openOrders],
  );

  const visible = areaId === 'all' ? tables : tables.filter((tb) => tb.areaId === areaId);
  const busy = visible.filter((tb) => orderByTable.has(tb.id));
  const revenue = busy.reduce((s, tb) => s + (orderByTable.get(tb.id)?.total ?? 0), 0);

  const openTable = (table: DiningTable) => {
    const order = orderByTable.get(table.id);
    if (order) {
      navigate(`/pos?order=${order.id}`);
      return;
    }
    useCart.getState().clear();
    useCart.getState().setTable(table.id, table.name);
    navigate('/pos');
  };

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <div className="page-title">{t('tab.title')}</div>
          <div className="page-sub">
            {t('tab.occupiedCount', { used: busy.length, total: visible.length })}
          </div>
        </div>
        <Button icon="settings" onClick={() => setManaging(true)}>
          {t('tab.manage')}
        </Button>
      </div>

      <div className="grid grid-3 mb-16">
        <Stat label={t('tab.occupied')} value={`${busy.length}`} />
        <Stat label={t('tab.available')} value={`${visible.length - busy.length}`} />
        <Stat label={t('common.revenue')} value={money(revenue)} hint={t('tab.occupied')} />
      </div>

      {tables.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="table"
            title={t('tab.noTables')}
            action={
              <Button variant="primary" icon="plus" onClick={() => setManaging(true)}>
                {t('tab.newTable')}
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="row wrap gap-4 mb-16">
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
              const order = orderByTable.get(table.id);
              return (
                <div key={table.id} className={`table-tile ${order ? 'busy' : ''}`}>
                  <button
                    type="button"
                    style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', width: '100%' }}
                    onClick={() => openTable(table)}
                  >
                    <div className="row between">
                      <span className="table-tile-name">{table.name}</span>
                      {order && <span className="badge badge-brand">{order.items.length}</span>}
                    </div>
                    <div className="table-tile-meta mt-4">
                      {order
                        ? formatDuration(now - order.createdAt, 'en')
                        : `${table.seats} ${t('tab.seats')}`}
                    </div>
                    {order && <div className="num strong mt-4">{money(order.total)}</div>}
                  </button>
                  {order && (
                    <div className="row gap-4 mt-4">
                      <Button size="sm" variant="ghost" onClick={() => setMoving({ order, from: table })}>
                        {t('tab.move')}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {managing && <TableManager areas={areas} tables={tables} onClose={() => setManaging(false)} />}
      {moving && (
        <MoveTableModal
          order={moving.order}
          from={moving.from}
          tables={tables}
          orderByTable={orderByTable}
          onClose={() => setMoving(null)}
        />
      )}
    </div>
  );
}

function MoveTableModal({
  order,
  from,
  tables,
  orderByTable,
  onClose,
}: {
  order: Order;
  from: DiningTable;
  tables: DiningTable[];
  orderByTable: Map<string, Order>;
  onClose: () => void;
}) {
  const t = useT();

  const move = async (target: DiningTable) => {
    const existing = orderByTable.get(target.id);
    if (existing) {
      const ok = await confirmDialog({
        title: t('tab.merge'),
        message: `${from.name} → ${target.name}`,
        confirmLabel: t('common.confirm'),
        cancelLabel: t('common.cancel'),
      });
      if (!ok) return;
    }
    const kind = await persistTableMove(order, target, existing);
    toast.success(kind === 'merged' ? t('tab.merged') : t('tab.moved', { name: target.name }));
    onClose();
  };

  return (
    <Modal open onClose={onClose} size="lg" title={`${t('tab.move')}: ${from.name}`}>
      <div className="table-grid">
        {tables
          .filter((tb) => tb.id !== from.id)
          .map((tb) => (
            <button
              key={tb.id}
              type="button"
              className={`table-tile ${orderByTable.has(tb.id) ? 'busy' : ''}`}
              onClick={() => void move(tb)}
            >
              <span className="table-tile-name">{tb.name}</span>
              <span className="table-tile-meta">
                {orderByTable.has(tb.id) ? t('tab.mergeInto') : t('tab.available')}
              </span>
            </button>
          ))}
      </div>
    </Modal>
  );
}

function TableManager({
  areas,
  tables,
  onClose,
}: {
  areas: Area[];
  tables: DiningTable[];
  onClose: () => void;
}) {
  const t = useT();
  const [areaName, setAreaName] = useState('');
  const [tableName, setTableName] = useState('');
  const [tableArea, setTableArea] = useState(areas[0]?.id ?? '');
  const [seats, setSeats] = useState(4);
  const [count, setCount] = useState(1);

  const addArea = async () => {
    if (!areaName.trim()) return;
    await db.areas.add({ id: newId('a'), name: areaName.trim(), sort: areas.length });
    setAreaName('');
    toast.success(t('common.saved'));
  };

  const removeArea = async (area: Area) => {
    const ok = await confirmDialog({
      title: t('common.confirmDelete', { name: area.name }),
      message: t('common.cannotUndo'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!ok) return;
    await db.transaction('rw', [db.areas, db.diningTables], async () => {
      await db.areas.delete(area.id);
      const ids = tables.filter((tb) => tb.areaId === area.id).map((tb) => tb.id);
      await db.diningTables.bulkDelete(ids);
    });
  };

  const addTables = async () => {
    const base = tableName.trim();
    if (!base || !tableArea) return;
    const existing = tables.filter((tb) => tb.areaId === tableArea).length;
    const rows: DiningTable[] = [];
    for (let i = 0; i < Math.max(1, count); i++) {
      rows.push({
        id: newId('t'),
        areaId: tableArea,
        name: count > 1 ? `${base}${i + 1}` : base,
        seats,
        sort: existing + i,
      });
    }
    await db.diningTables.bulkAdd(rows);
    setTableName('');
    setCount(1);
    toast.success(t('common.saved'));
  };

  const removeTable = async (table: DiningTable) => {
    const open = await db.orders.where('status').equals('open').toArray();
    if (open.some((o) => o.tableId === table.id)) {
      toast.error(t('tab.occupied'));
      return;
    }
    await db.diningTables.delete(table.id);
  };

  return (
    <Modal open onClose={onClose} size="lg" title={t('tab.manage')}>
      <div className="col gap-16">
        <div className="card card-pad">
          <div className="card-title mb-8">{t('tab.area')}</div>
          <div className="row gap-8 mb-12">
            <Input
              value={areaName}
              placeholder={t('tab.newArea')}
              onChange={(e) => setAreaName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addArea();
              }}
            />
            <Button icon="plus" onClick={() => void addArea()}>
              {t('common.add')}
            </Button>
          </div>
          <div className="row wrap gap-4">
            {areas.map((a) => (
              <span key={a.id} className="badge">
                {a.name}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-icon"
                  style={{ padding: 0, marginLeft: 4 }}
                  onClick={() => void removeArea(a)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="card card-pad">
          <div className="card-title mb-8">{t('tab.newTable')}</div>
          <div className="grid grid-4">
            <Field label={t('common.name')}>
              <Input value={tableName} placeholder="A" onChange={(e) => setTableName(e.target.value)} />
            </Field>
            <Field label={t('tab.area')}>
              <Select value={tableArea} onChange={(e) => setTableArea(e.target.value)}>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('tab.seats')}>
              <NumberInput value={seats} onChange={setSeats} min={1} />
            </Field>
            <Field label={t('common.quantity')}>
              <NumberInput value={count} onChange={setCount} min={1} max={40} />
            </Field>
          </div>
          <Button className="mt-12" icon="plus" onClick={() => void addTables()} disabled={!areas.length}>
            {t('common.add')}
          </Button>
        </div>

        <div className="card">
          {tables.length === 0 ? (
            <EmptyState icon="table" title={t('tab.noTables')} />
          ) : (
            tables.map((tb) => (
              <div key={tb.id} className="list-row">
                <span className="grow strong">{tb.name}</span>
                <span className="dim small">{areas.find((a) => a.id === tb.areaId)?.name}</span>
                <span className="dim small">
                  {tb.seats} {t('tab.seats')}
                </span>
                <Button variant="ghost" size="sm" icon="trash" onClick={() => void removeTable(tb)} />
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
