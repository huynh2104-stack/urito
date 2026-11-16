import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Modal, Select, SearchInput, Stat } from '@/components/ui';
import { db } from '@/db/db';
import { useLiveQuery } from '@/lib/useLiveQuery';
import { formatDateTime, rangeOf, type RangePreset } from '@/core/date';
import { useApp, useCan, useMoney, useT } from '@/store/app';
import { navigate, useRoute } from '@/router';
import { summarise } from '@/services/reports';
import { downloadCsv, timestampedName } from '@/services/csv';
import { formatAmount } from '@/core/money';
import { OrderDetail } from './OrderDetail';
import { importEcOrders, parseEcOrdersCsv, type EcImportResult, type ParsedEcOrder } from '@/services/ecImport';
import { toast } from '@/store/ui';
import { RANGE_PRESETS, RangePicker } from '@/features/reports/RangePicker';
import type { Order, OrderStatus } from '@/db/types';
import type { TranslationKey } from '@/i18n';

const STATUS_LABEL: Record<OrderStatus, TranslationKey> = {
  paid: 'orders.statusPaid',
  open: 'orders.statusOpen',
  void: 'orders.statusVoid',
  refunded: 'orders.statusRefunded',
};

const STATUS_TONE: Record<OrderStatus, string> = {
  paid: 'badge-success',
  open: 'badge-warn',
  void: 'badge-danger',
  refunded: 'badge-info',
};

export function OrdersPage() {
  const t = useT();
  const money = useMoney();
  const settings = useApp((s) => s.settings);
  const user = useApp((s) => s.user);
  const canSeeAll = useCan('viewAllOrders');
  const route = useRoute();

  const weekStartsOn = settings.weekStartsOn ?? (settings.lang === 'ja' ? 0 : 1);
  const [preset, setPreset] = useState<RangePreset>('today');
  const [custom, setCustom] = useState(() => rangeOf('today', Date.now(), weekStartsOn));
  const [status, setStatus] = useState<'all' | OrderStatus>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Order | null>(null);
  const [importingEc, setImportingEc] = useState(false);

  const [now] = useState(() => Date.now());
  const range = preset === 'custom' ? custom : rangeOf(preset, now, weekStartsOn);

  const orders = useLiveQuery(
    async () => {
      const [paidInRange, createdInRange] = await Promise.all([
        db.orders.where('paidAt').between(range.from, range.to, true, true).toArray(),
        db.orders.where('createdAt').between(range.from, range.to, true, true).toArray(),
      ]);
      const byId = new Map<string, Order>();
      for (const o of paidInRange) byId.set(o.id, o);
      for (const o of createdInRange) {
        if (o.status === 'open' || o.paidAt === 0) byId.set(o.id, o);
      }
      return [...byId.values()].sort((a, b) => (b.paidAt || b.createdAt) - (a.paidAt || a.createdAt));
    },
    [range.from, range.to],
    [] as Order[],
  );

  const openId = route.query.get('id');
  useEffect(() => {
    if (!openId) return;
    void db.orders.get(openId).then((order) => {
      if (order) setSelected(order);
      navigate('/orders', true);
    });
  }, [openId]);

  const visible = useMemo(() => {
    let list = orders;
    if (!canSeeAll && user) list = list.filter((o) => o.userId === user.id);
    if (status !== 'all') list = list.filter((o) => o.status === status);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (o) =>
          o.code.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.tableName.toLowerCase().includes(q) ||
          o.items.some((i) => i.name.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [orders, status, search, canSeeAll, user]);

  const PAGE_SIZE = 100;
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * PAGE_SIZE;
  const paged = useMemo(() => visible.slice(pageStart, pageStart + PAGE_SIZE), [visible, pageStart]);

  const summary = summarise(visible);

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      [
        t('orders.code'),
        t('common.date'),
        t('common.status'),
        t('pos.orderType'),
        t('common.customer'),
        t('orders.cashier'),
        t('common.subtotal'),
        t('common.discount'),
        t('common.tax'),
        t('common.total'),
        t('rep.refunds'),
        t('orders.paymentMethod'),
      ],
    ];
    for (const o of visible) {
      rows.push([
        o.code,
        formatDateTime(o.paidAt || o.createdAt, settings.lang),
        t(STATUS_LABEL[o.status]),
        o.type,
        o.customerName,
        o.userName,
        formatAmount(o.subtotal, settings.currency, 'en'),
        formatAmount(o.discount, settings.currency, 'en'),
        formatAmount(o.tax, settings.currency, 'en'),
        formatAmount(o.total, settings.currency, 'en'),
        formatAmount(o.refundedAmount, settings.currency, 'en'),
        o.payments.map((p) => p.method).join(' + '),
      ]);
    }
    downloadCsv(timestampedName('urito-invoices'), rows);
  };

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <div className="page-title">{t('orders.title')}</div>
          <div className="page-sub">
            {t('common.showing', {
              from: visible.length ? pageStart + 1 : 0,
              to: Math.min(pageStart + PAGE_SIZE, visible.length),
              total: visible.length,
            })}
          </div>
        </div>
        <div className="row gap-8">
          <Button icon="upload" onClick={() => setImportingEc(true)}>
            {t('orders.importEc')}
          </Button>
          <Button icon="download" onClick={exportCsv} disabled={!visible.length}>
            {t('orders.exportCsv')}
          </Button>
        </div>
      </div>

      <div className="grid grid-4 mb-16">
        <Stat label={t('rep.revenue')} value={money(summary.netRevenue)} />
        <Stat label={t('rep.orderCount')} value={String(summary.orderCount)} />
        <Stat label={t('rep.avgOrder')} value={money(summary.avgOrder)} />
        <Stat label={t('rep.refunds')} value={money(summary.refunds)} tone={summary.refunds ? 'danger' : undefined} />
      </div>

      <div className="card mb-16 card-pad">
        <div className="row wrap gap-8">
          <RangePicker
            preset={preset}
            onPreset={setPreset}
            range={custom}
            onRange={setCustom}
            presets={RANGE_PRESETS}
          />
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} style={{ width: 170 }}>
            <option value="all">{t('orders.filterAll')}</option>
            <option value="paid">{t('orders.statusPaid')}</option>
            <option value="open">{t('orders.statusOpen')}</option>
            <option value="refunded">{t('orders.statusRefunded')}</option>
            <option value="void">{t('orders.statusVoid')}</option>
          </Select>
          <SearchInput value={search} onChange={setSearch} placeholder={t('common.searchPlaceholder')} />
        </div>
      </div>

      <div className="card">
        {visible.length === 0 ? (
          <EmptyState icon="receipt" title={t('orders.noOrders')} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('orders.code')}</th>
                  <th>{t('common.time')}</th>
                  <th>{t('common.customer')}</th>
                  <th>{t('orders.cashier')}</th>
                  <th className="right">{t('common.items')}</th>
                  <th className="right">{t('common.total')}</th>
                  <th>{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((order) => (
                  <tr key={order.id} className="clickable" onClick={() => setSelected(order)}>
                    <td className="strong">
                      {order.code || '—'}
                      {order.channel && order.channel !== 'pos' && (
                        <span className="badge badge-info ml-4">{order.channel.toUpperCase()}</span>
                      )}
                    </td>
                    <td className="nowrap">{formatDateTime(order.paidAt || order.createdAt, settings.lang)}</td>
                    <td className="truncate">
                      {order.customerName || t('pos.walkIn')}
                      {order.tableName ? <span className="dim"> · {order.tableName}</span> : null}
                    </td>
                    <td>{order.userName}</td>
                    <td className="right num">{order.items.length}</td>
                    <td className="right num strong">{money(order.total)}</td>
                    <td>
                      <span className={`badge ${STATUS_TONE[order.status]}`}>{t(STATUS_LABEL[order.status])}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pageCount > 1 && (
        <div className="row between mt-12">
          <Button size="sm" disabled={safePage <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            {t('common.back')}
          </Button>
          <span className="small muted">
            {safePage + 1} / {pageCount}
          </span>
          <Button size="sm" disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>
            {t('common.next')}
          </Button>
        </div>
      )}

      {selected && (
        <Modal open onClose={() => setSelected(null)} size="lg" title={t('orders.detail')}>
          <OrderDetail order={selected} onChanged={(next) => setSelected(next)} onClose={() => setSelected(null)} />
        </Modal>
      )}
      {importingEc && <EcImportModal onClose={() => setImportingEc(false)} />}
    </div>
  );
}


function EcImportModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const user = useApp((s) => s.user);
  const [parsed, setParsed] = useState<ParsedEcOrder[]>([]);
  const [result, setResult] = useState<EcImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    setResult(null);
    const text = await file.text();
    setParsed(parseEcOrdersCsv(text, { currency: settings.currency }));
  };

  const commit = async () => {
    if (!parsed.length) return;
    setBusy(true);
    try {
      const res = await importEcOrders(parsed, { user, settings });
      setResult(res);
      toast.success(t('orders.ecSummary', { imported: res.imported, skipped: res.skippedDuplicates }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('orders.importEc')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.close')}</Button>
          <Button variant="primary" disabled={!parsed.length || busy} onClick={() => void commit()}>
            {t('common.import')} ({parsed.length})
          </Button>
        </>
      }
    >
      <div className="col gap-12">
        <div className="callout">{t('orders.ecHint')}</div>
        <input
          className="input"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
        {parsed.length > 0 && <div className="badge badge-info">{t('orders.ecPreviewCount', { n: parsed.length })}</div>}
        {result && (
          <div className="col gap-8">
            <div className="callout callout-success">
              {t('orders.ecSummary', { imported: result.imported, skipped: result.skippedDuplicates })}
            </div>
            {result.unresolvedSkus.length > 0 && (
              <div className="callout callout-warn">
                {t('orders.ecUnresolved', { skus: result.unresolvedSkus.join(', ') })}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
