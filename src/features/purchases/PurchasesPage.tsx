import { useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  EmptyState,
  Field,
  Modal,
  MoneyInput,
  NumberInput,
  SearchInput,
  Select,
  Stat,
  Textarea,
} from '@/components/ui';
import { db } from '@/db/db';
import { useLiveQuery } from '@/lib/useLiveQuery';
import { formatCode, newId } from '@/core/id';
import { formatDateTime } from '@/core/date';
import { useApp, useMoney, useT } from '@/store/app';
import { confirmDialog, toast } from '@/store/ui';
import { receivePurchase } from '@/services/purchases';
import { removeTones } from '@/features/pos/PosPage';
import type { Product, Purchase, PurchaseItem, Supplier } from '@/db/types';

export function PurchasesPage() {
  const t = useT();
  const money = useMoney();
  const lang = useApp((s) => s.settings.lang);
  const [editing, setEditing] = useState<Purchase | 'new' | null>(null);

  const purchases = useLiveQuery(
    async () => (await db.purchases.toArray()).sort((a, b) => b.createdAt - a.createdAt),
    [],
    [] as Purchase[],
  );
  const suppliers = useLiveQuery(async () => db.suppliers.filter((s) => s.active).toArray(), [], []);
  const products = useLiveQuery(async () => db.products.filter((p) => p.active).toArray(), [], []);

  const totalValue = purchases
    .filter((p) => p.status === 'received')
    .reduce((s, p) => s + p.total, 0);
  const outstanding = purchases.reduce((s, p) => s + Math.max(0, p.total - p.paid), 0);

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <div className="page-title">{t('pur.title')}</div>
          <div className="page-sub">{purchases.length}</div>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
          {t('pur.new')}
        </Button>
      </div>

      <div className="grid grid-3 mb-16">
        <Stat label={t('pur.statusReceived')} value={String(purchases.filter((p) => p.status === 'received').length)} />
        <Stat label={t('common.total')} value={money(totalValue)} />
        <Stat label={t('pur.remaining')} value={money(outstanding)} tone={outstanding ? 'warn' : undefined} />
      </div>

      <div className="card">
        {purchases.length === 0 ? (
          <EmptyState icon="truck" title={t('pur.noPurchases')} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.code')}</th>
                  <th>{t('common.date')}</th>
                  <th>{t('pur.supplier')}</th>
                  <th className="right">{t('common.items')}</th>
                  <th className="right">{t('common.total')}</th>
                  <th className="right">{t('pur.remaining')}</th>
                  <th>{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => setEditing(p)}>
                    <td className="strong">{p.code}</td>
                    <td className="nowrap dim">{formatDateTime(p.createdAt, lang)}</td>
                    <td>{p.supplierName || '—'}</td>
                    <td className="right num">{p.items.length}</td>
                    <td className="right num strong">{money(p.total)}</td>
                    <td className="right num">
                      {p.total - p.paid > 0 ? (
                        <span className="text-warn">{money(p.total - p.paid)}</span>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${p.status === 'received' ? 'badge-success' : 'badge-warn'}`}>
                        {t(p.status === 'received' ? 'pur.statusReceived' : 'pur.statusDraft')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <PurchaseForm
          purchase={editing === 'new' ? null : editing}
          suppliers={suppliers}
          products={products}
          count={purchases.length}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function PurchaseForm({
  purchase,
  suppliers,
  products,
  count,
  onClose,
}: {
  purchase: Purchase | null;
  suppliers: Supplier[];
  products: Product[];
  count: number;
  onClose: () => void;
}) {
  const t = useT();
  const money = useMoney();
  const user = useApp((s) => s.user);
  const readOnly = purchase?.status === 'received';

  const [supplierId, setSupplierId] = useState(purchase?.supplierId ?? '');
  const [items, setItems] = useState<PurchaseItem[]>(purchase?.items ?? []);
  const [paid, setPaid] = useState(purchase?.paid ?? 0);
  const [note, setNote] = useState(purchase?.note ?? '');
  const [updateCost, setUpdateCost] = useState(true);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const subtotal = items.reduce((s, i) => s + i.total, 0);

  const matches = useMemo(() => {
    const q = removeTones(search.trim().toLowerCase());
    if (!q) return [];
    return products
      .filter((p) => removeTones(p.name.toLowerCase()).includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 8);
  }, [products, search]);

  const addItem = (product: Product) => {
    setSearch('');
    setItems((list) => {
      const found = list.findIndex((i) => i.productId === product.id);
      if (found >= 0) {
        const next = [...list];
        const qty = next[found].qty + 1;
        next[found] = { ...next[found], qty, total: Math.round(next[found].cost * qty) };
        return next;
      }
      return [
        ...list,
        { productId: product.id, name: product.name, qty: 1, cost: product.cost, total: product.cost },
      ];
    });
  };

  const update = (index: number, patch: Partial<PurchaseItem>) =>
    setItems((list) =>
      list.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item, ...patch };
        return { ...next, total: Math.round(next.cost * next.qty) };
      }),
    );

  const buildPurchase = (status: 'draft' | 'received'): Purchase => ({
    id: purchase?.id ?? newId('pu'),
    code: purchase?.code ?? formatCode('PN', count + 1),
    supplierId: supplierId || null,
    supplierName: suppliers.find((s) => s.id === supplierId)?.name ?? '',
    items,
    subtotal,
    discount: 0,
    total: subtotal,
    paid,
    status,
    note: note.trim(),
    userId: user?.id ?? '',
    userName: user?.name ?? '',
    createdAt: purchase?.createdAt ?? Date.now(),
    receivedAt: purchase?.receivedAt ?? 0,
  });

  const saveDraft = async () => {
    if (!items.length) {
      toast.warning(t('pur.emptyItems'));
      return;
    }
    await db.purchases.put(buildPurchase('draft'));
    toast.success(t('common.saved'));
    onClose();
  };

  const receive = async () => {
    if (!items.length) {
      toast.warning(t('pur.emptyItems'));
      return;
    }
    const row = buildPurchase('draft');
    const ok = await confirmDialog({
      title: t('pur.receive'),
      message: `${row.code} · ${money(row.total)}`,
      confirmLabel: t('common.confirm'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await db.purchases.put(row);
      await receivePurchase(row, updateCost, user);
      toast.success(t('pur.received', { code: row.code }));
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={purchase ? purchase.code : t('pur.new')}
      footer={
        readOnly ? (
          <Button onClick={onClose}>{t('common.close')}</Button>
        ) : (
          <>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button onClick={() => void saveDraft()}>{t('pur.statusDraft')}</Button>
            <Button variant="primary" disabled={busy} onClick={() => void receive()}>
              {t('pur.receive')}
            </Button>
          </>
        )
      }
    >
      <div className="col gap-16">
        <div className="grid grid-2">
          <Field label={t('pur.supplier')}>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={readOnly}>
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('pur.paidAmount')}>
            <MoneyInput value={paid} onChange={setPaid} disabled={readOnly} />
          </Field>
        </div>

        {!readOnly && (
          <div style={{ position: 'relative' }}>
            <SearchInput value={search} onChange={setSearch} placeholder={t('pur.addItem')} />
            {matches.length > 0 && (
              <div
                className="card"
                style={{ position: 'absolute', zIndex: 5, width: '100%', marginTop: 4, boxShadow: 'var(--shadow-2)' }}
              >
                {matches.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="list-row w-full"
                    style={{ background: 'none', border: 0, textAlign: 'left' }}
                    onClick={() => addItem(p)}
                  >
                    <span className="grow">{p.name}</span>
                    <span className="dim small">{money(p.cost)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="card table-wrap">
          {items.length === 0 ? (
            <EmptyState icon="box" title={t('pur.emptyItems')} />
          ) : (
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th className="right" style={{ width: 120 }}>
                    {t('common.quantity')}
                  </th>
                  <th className="right" style={{ width: 150 }}>
                    {t('common.cost')}
                  </th>
                  <th className="right">{t('common.amount')}</th>
                  {!readOnly && <th />}
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.productId}>
                    <td className="strong">{item.name}</td>
                    <td className="right">
                      {readOnly ? (
                        <span className="num">{item.qty}</span>
                      ) : (
                        <NumberInput value={item.qty} onChange={(v) => update(i, { qty: v })} min={0} />
                      )}
                    </td>
                    <td className="right">
                      {readOnly ? (
                        <span className="num">{money(item.cost)}</span>
                      ) : (
                        <MoneyInput value={item.cost} onChange={(v) => update(i, { cost: v })} />
                      )}
                    </td>
                    <td className="right num strong">{money(item.total)}</td>
                    {!readOnly && (
                      <td className="right">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon="trash"
                          onClick={() => setItems(items.filter((_, j) => j !== i))}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="row between">
          <Field label={t('common.note')}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={readOnly} />
          </Field>
          <div className="right" style={{ minWidth: 220 }}>
            <div className="row between">
              <span className="muted">{t('common.total')}</span>
              <span className="num strong" style={{ fontSize: 20 }}>
                {money(subtotal)}
              </span>
            </div>
            <div className="row between small muted">
              <span>{t('pur.remaining')}</span>
              <span className="num">{money(Math.max(0, subtotal - paid))}</span>
            </div>
          </div>
        </div>

        {!readOnly && (
          <Checkbox checked={updateCost} onChange={setUpdateCost} label={t('pur.updateCost')} />
        )}
      </div>
    </Modal>
  );
}
