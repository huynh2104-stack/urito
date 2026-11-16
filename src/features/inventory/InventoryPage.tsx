import { ProductThumb } from '@/components/ProductThumb';
import { useMemo, useState } from 'react';
import { Button, EmptyState, Field, Input, Modal, NumberInput, SearchInput, Select, Stat, Tabs } from '@/components/ui';
import { db } from '@/db/db';
import { docPrefixes } from '@/db/defaults';
import { getDeviceNo, nextSeq } from '@/db/seq';
import { useLiveQuery } from '@/lib/useLiveQuery';
import { formatDateTime } from '@/core/date';
import { formatQty } from '@/core/money';
import { useApp, useMoney, useT } from '@/store/app';
import { toast } from '@/store/ui';
import { applyStockChanges, summariseStock } from '@/services/inventory';
import { matchesProduct } from '@/core/search';
import { formatCode, newId } from '@/core/id';
import { navigate } from '@/router';
import type { Product, Purchase, StockMoveType, StockMovement } from '@/db/types';
import type { TranslationKey } from '@/i18n';

const MOVE_LABEL: Record<StockMoveType, TranslationKey> = {
  in: 'inv.typeIn',
  out: 'inv.typeOut',
  adjust: 'inv.typeAdjust',
  sale: 'inv.typeSale',
  return: 'inv.typeReturn',
  waste: 'inv.typeWaste',
  init: 'inv.typeInit',
};

type TabKey = 'stock' | 'history';
type StockFilter = 'all' | 'low' | 'out';

export function InventoryPage() {
  const t = useT();
  const money = useMoney();
  const lang = useApp((s) => s.settings.lang);

  const [tab, setTab] = useState<TabKey>('stock');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');
  const [adjusting, setAdjusting] = useState<Product | null>(null);

  const products = useLiveQuery(async () => db.products.toArray(), [], []);
  const movements = useLiveQuery(
    async () => (await db.stockMovements.orderBy('at').reverse().limit(400).toArray()),
    [],
    [] as StockMovement[],
  );

  const summary = useMemo(() => summariseStock(products), [products]);
  const user = useApp((s) => s.user);

    /** 在庫不足状態からワンクリックで下限在庫の2倍（未設定時は10）まで補充する発注書を作成する。 */
  const reorder = async () => {
    const low = [...summary.outOfStock, ...summary.lowStock];
    if (!low.length) return;
    const items = low.map((p) => {
      const qty = Math.max(1, Math.ceil((p.minStock > 0 ? p.minStock * 2 : 10) - Math.max(0, p.stock)));
      return { productId: p.id, name: p.name, qty, cost: p.cost, total: Math.round(p.cost * qty) };
    });
    const draft = await db.transaction('rw', [db.purchases, db.kv], async () => {
      const seq = await nextSeq('purchase');
      const dev = await getDeviceNo();
      const row: Purchase = {
        id: newId('pu'),
        code: formatCode(docPrefixes(lang).purchase, seq, new Date(), dev),
        supplierId: null,
        supplierName: '',
        items,
        subtotal: items.reduce((s, i) => s + i.total, 0),
        discount: 0,
        total: items.reduce((s, i) => s + i.total, 0),
        paid: 0,
        status: 'draft',
        note: t('inv.reorderNote'),
        userId: user?.id ?? '',
        userName: user?.name ?? '',
        createdAt: Date.now(),
        receivedAt: 0,
      };
      await db.purchases.add(row);
      return row;
    });
    toast.success(t('inv.reorderCreated', { code: draft.code }));
    navigate('/purchases');
  };

  const visible = useMemo(() => {
    let list = products.filter((p) => p.active && p.trackStock && !p.isService);
    if (filter === 'low') list = list.filter((p) => p.minStock > 0 && p.stock <= p.minStock && p.stock > 0);
    if (filter === 'out') list = list.filter((p) => p.stock <= 0);
    if (search.trim()) list = list.filter((p) => matchesProduct(p, search));
    return list.sort((a, b) => a.stock - b.stock);
  }, [products, filter, search]);

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <div className="page-title">{t('inv.title')}</div>
          <div className="page-sub">
            {summary.trackedCount} {t('common.items')}
          </div>
        </div>
        {summary.lowStock.length + summary.outOfStock.length > 0 && (
          <Button variant="primary" icon="truck" onClick={() => void reorder()}>
            {t('inv.reorder')}
          </Button>
        )}
      </div>

      <div className="grid grid-4 mb-16">
        <Stat label={t('inv.stockValue')} value={money(summary.totalValue)} />
        <Stat label={t('common.revenue')} value={money(summary.totalRetail)} hint={t('inv.stockValue')} />
        <Stat
          label={t('inv.lowStock')}
          value={String(summary.lowStock.length)}
          tone={summary.lowStock.length ? 'warn' : undefined}
        />
        <Stat
          label={t('inv.outOfStock')}
          value={String(summary.outOfStock.length)}
          tone={summary.outOfStock.length ? 'danger' : undefined}
        />
      </div>

      <Tabs
        tabs={[
          { key: 'stock' as const, label: t('inv.title') },
          { key: 'history' as const, label: t('inv.movements') },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'stock' ? (
        <>
          <div className="card card-pad mt-16 mb-16">
            <div className="row gap-8 wrap">
              <SearchInput value={search} onChange={setSearch} placeholder={t('common.searchPlaceholder')} />
              <Select
                aria-label={t('common.filter')}
                value={filter}
                onChange={(e) => setFilter(e.target.value as StockFilter)}
                style={{ width: 180 }}
              >
                <option value="all">{t('common.all')}</option>
                <option value="low">{t('inv.lowStock')}</option>
                <option value="out">{t('inv.outOfStock')}</option>
              </Select>
            </div>
          </div>

          <div className="card">
            {visible.length === 0 ? (
              <EmptyState icon="warehouse" title={t('common.noResults')} />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('common.name')}</th>
                      <th className="right">{t('inv.currentStock')}</th>
                      <th className="right">{t('products.minStock')}</th>
                      <th className="right">{t('common.cost')}</th>
                      <th className="right">{t('inv.stockValue')}</th>
                      <th className="right">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((p) => {
                      const low = p.minStock > 0 && p.stock <= p.minStock;
                      return (
                        <tr key={p.id}>
                          <td>
                            <div className="row gap-12">
                              <ProductThumb productId={p.id} imageRev={p.imageRev} name={p.name} color={p.color} image={p.image} size={38} />
                              <div>
                                <div className="strong">{p.name}</div>
                                {p.sku && <div className="tiny dim">{p.sku}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="right num">
                            <span className={p.stock <= 0 ? 'text-danger strong' : low ? 'text-warn strong' : ''}>
                              {formatQty(p.stock, lang)}
                            </span>
                            {p.unit ? <span className="dim"> {p.unit}</span> : null}
                          </td>
                          <td className="right num dim">{p.minStock || '—'}</td>
                          <td className="right num dim">{money(p.cost)}</td>
                          <td className="right num">{money(Math.round(p.cost * p.stock))}</td>
                          <td className="right">
                            <Button size="sm" onClick={() => setAdjusting(p)}>
                              {t('inv.adjust')}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="card mt-16">
          {movements.length === 0 ? (
            <EmptyState icon="list" title={t('inv.noMovements')} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('common.time')}</th>
                    <th>{t('common.name')}</th>
                    <th>{t('common.type')}</th>
                    <th className="right">{t('common.quantity')}</th>
                    <th className="right">{t('inv.currentStock')}</th>
                    <th>{t('common.note')}</th>
                    <th>{t('common.employee')}</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((mv) => (
                    <tr key={mv.id}>
                      <td className="nowrap dim">{formatDateTime(mv.at, lang)}</td>
                      <td className="strong">{mv.productName}</td>
                      <td>
                        <span className="badge">{t(MOVE_LABEL[mv.type])}</span>
                      </td>
                      <td className={`right num strong ${mv.qty > 0 ? 'text-success' : 'text-danger'}`}>
                        {mv.qty > 0 ? '+' : ''}
                        {formatQty(mv.qty, lang)}
                      </td>
                      <td className="right num dim">{formatQty(mv.after, lang)}</td>
                      <td className="dim truncate">{mv.note}</td>
                      <td className="dim">{mv.userName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {adjusting && <StockAdjustModal product={adjusting} onClose={() => setAdjusting(null)} />}
    </div>
  );
}

function StockAdjustModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const t = useT();
  const lang = useApp((s) => s.settings.lang);
  const user = useApp((s) => s.user);

  const [mode, setMode] = useState<'in' | 'out' | 'adjust' | 'waste'>('in');
  const [qty, setQty] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const delta = mode === 'adjust' ? qty - product.stock : mode === 'in' ? qty : -qty;

  const submit = async () => {
    if (mode !== 'adjust' && qty <= 0) return;
    if (delta === 0) return;
    setBusy(true);
    try {
      await db.transaction('rw', [db.products, db.stockMovements], async () => {
        await applyStockChanges(
          [
            {
              productId: product.id,
              delta,
              type: mode === 'waste' ? 'waste' : mode,
              cost: product.cost,
              refType: 'manual',
              note: note.trim(),
            },
          ],
          user,
        );
      });
      toast.success(t('inv.applied'));
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={product.name}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || delta === 0} onClick={() => void submit()}>
            {t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="col gap-16">
        <div className="btn-group w-full">
          {(['in', 'out', 'adjust', 'waste'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`btn grow ${mode === m ? 'active' : ''}`}
              onClick={() => {
                setMode(m);
                setQty(m === 'adjust' ? product.stock : 0);
              }}
            >
              {t(m === 'in' ? 'inv.stockIn' : m === 'out' ? 'inv.stockOut' : m === 'adjust' ? 'inv.adjust' : 'inv.waste')}
            </button>
          ))}
        </div>

        <div className="callout">
          {t('inv.currentStock')}: <strong>{formatQty(product.stock, lang)}</strong>
          {delta !== 0 && (
            <>
              {' → '}
              <strong>{formatQty(product.stock + delta, lang)}</strong>
            </>
          )}
        </div>

        <Field label={mode === 'adjust' ? t('inv.newStock') : t('common.quantity')}>
          <NumberInput value={qty} onChange={setQty} min={0} initialFocus />
        </Field>

        <Field label={t('inv.reason')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
