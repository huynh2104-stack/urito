import { useState } from 'react';
import { Button, Checkbox, Field, Input, Modal, Select } from '@/components/ui';
import { formatDateTime } from '@/core/date';
import { formatQty } from '@/core/money';
import { db } from '@/db/db';
import { useApp, useCan, useMoney, useT } from '@/store/app';
import { toast } from '@/store/ui';
import { printDocument } from '@/print/PrintHost';
import { Receipt } from '@/print/Receipt';
import { refundAmountFor, refundOrder, voidOrder } from '@/services/orders';
import type { Order, PayMethod } from '@/db/types';
import type { TranslationKey } from '@/i18n';

const METHOD_KEY: Record<PayMethod, TranslationKey> = {
  cash: 'pay.cash',
  card: 'pay.card',
  transfer: 'pay.transfer',
  ewallet: 'pay.ewallet',
  qr: 'pay.qr',
  debt: 'pay.debt',
  points: 'pay.points',
};

export function OrderDetail({
  order,
  onChanged,
  onClose,
}: {
  order: Order;
  onChanged: (order: Order) => void;
  onClose: () => void;
}) {
  const t = useT();
  const money = useMoney();
  const lang = useApp((s) => s.settings.lang);
  const user = useApp((s) => s.user);
  const canVoid = useCan('voidOrder');
  const canRefund = useCan('refund');

  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [showRefund, setShowRefund] = useState(false);

  const reload = async () => {
    const fresh = await db.orders.get(order.id);
    if (fresh) onChanged(fresh);
  };

  const doVoid = async () => {
    await voidOrder(order, voidReason.trim(), user);
    toast.success(t('orders.statusVoid'));
    setShowVoid(false);
    await reload();
  };

  return (
    <div className="col gap-16">
      <div className="row between wrap gap-8">
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{order.code || '—'}</div>
          <div className="small muted">{formatDateTime(order.paidAt || order.createdAt, lang)}</div>
        </div>
        <div className="right small">
          <div>
            {t('orders.cashier')}: <strong>{order.userName}</strong>
          </div>
          <div>
            {t('common.customer')}: <strong>{order.customerName || t('pos.walkIn')}</strong>
          </div>
          {order.tableName && (
            <div>
              {t('pos.table')}: <strong>{order.tableName}</strong>
            </div>
          )}
        </div>
      </div>

      <div className="table-wrap card">
        <table className="table table-compact">
          <thead>
            <tr>
              <th>{t('rc.item')}</th>
              <th className="right">{t('common.qty')}</th>
              <th className="right">{t('common.price')}</th>
              <th className="right">{t('common.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="strong">{item.name}</div>
                  {item.modifiers.length > 0 && (
                    <div className="tiny dim">{item.modifiers.map((m) => m.name).join(', ')}</div>
                  )}
                  {item.note && <div className="tiny text-warn">* {item.note}</div>}
                  {item.refundedQty > 0 && (
                    <div className="tiny text-danger">
                      {t('orders.refundQty')}: {formatQty(item.refundedQty, lang)}
                    </div>
                  )}
                </td>
                <td className="right num">{formatQty(item.qty, lang)}</td>
                <td className="right num">{money(Math.round(item.gross / (item.qty || 1)))}</td>
                <td className="right num strong">{money(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card card-pad">
        <Row label={t('common.subtotal')} value={money(order.subtotal)} />
        {order.discount > 0 && <Row label={t('common.discount')} value={`-${money(order.discount)}`} />}
        {order.serviceCharge > 0 && <Row label={t('common.serviceCharge')} value={money(order.serviceCharge)} />}
        {order.tax > 0 && <Row label={`${t('common.tax')} ${order.taxRate}%`} value={money(order.tax)} />}
        {order.pointsValue > 0 && <Row label={t('rc.pointsUsed')} value={`-${money(order.pointsValue)}`} />}
        {order.rounding !== 0 && <Row label={t('common.rounding')} value={money(order.rounding)} />}
        <div className="divider" />
        <Row label={t('common.total')} value={money(order.total)} strong />
        {order.payments.map((p) => (
          <Row key={p.id} label={t(METHOD_KEY[p.method])} value={money(p.amount)} muted />
        ))}
        {order.changeAmount > 0 && <Row label={t('pay.change')} value={money(order.changeAmount)} muted />}
        {order.dueAmount > 0 && <Row label={t('pay.due')} value={money(order.dueAmount)} muted />}
        {order.refundedAmount > 0 && (
          <Row label={t('rep.refunds')} value={`-${money(order.refundedAmount)}`} muted />
        )}
      </div>

      {order.refunds.length > 0 && (
        <div className="card card-pad">
          <div className="card-title mb-8">{t('rep.refunds')}</div>
          {order.refunds.map((r) => (
            <div key={r.id} className="row between small" style={{ padding: '3px 0' }}>
              <span>
                {formatDateTime(r.at, lang)} · {r.reason || '—'}
              </span>
              <span className="num">{money(r.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {order.voidReason && (
        <div className="callout callout-danger">
          {t('orders.voidReason')}: {order.voidReason}
        </div>
      )}

      <div className="row wrap gap-8">
        <Button icon="print" onClick={() => printDocument(<Receipt order={order} />)}>
          {t('orders.reprint')}
        </Button>
        <span className="grow" />
        {canRefund && order.status === 'paid' && (
          <Button icon="refresh" onClick={() => setShowRefund(true)}>
            {t('orders.refund')}
          </Button>
        )}
        {canVoid && order.status !== 'void' && (
          <Button variant="danger" icon="x" onClick={() => setShowVoid(true)}>
            {t('orders.void')}
          </Button>
        )}
      </div>

      <Modal
        open={showVoid}
        onClose={() => setShowVoid(false)}
        size="sm"
        title={t('orders.void')}
        footer={
          <>
            <Button onClick={() => setShowVoid(false)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={() => void doVoid()}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <p className="muted">{t('orders.voidConfirm', { code: order.code })}</p>
        <Field label={t('orders.voidReason')}>
          <Input initialFocus value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
        </Field>
      </Modal>

      {showRefund && (
        <RefundModal
          order={order}
          onClose={() => setShowRefund(false)}
          onDone={() => {
            setShowRefund(false);
            void reload().then(() => onClose());
          }}
        />
      )}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`row between ${muted ? 'small muted' : ''}`}
      style={{ padding: '2px 0', fontSize: strong ? 17 : undefined, fontWeight: strong ? 700 : undefined }}
    >
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

function RefundModal({
  order,
  onClose,
  onDone,
}: {
  order: Order;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const money = useMoney();
  const lang = useApp((s) => s.settings.lang);
  const user = useApp((s) => s.user);

  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<PayMethod>(order.payments[0]?.method ?? 'cash');
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState(false);

  const lines = order.items
    .map((item) => ({ item, max: item.qty - item.refundedQty }))
    .filter((l) => l.max > 0);

  const total = lines.reduce(
    (sum, l) => sum + refundAmountFor(order, l.item, Math.min(qtys[l.item.id] ?? 0, l.max)),
    0,
  );

  const submit = async () => {
    const picked = lines
      .map((l) => ({ itemId: l.item.id, qty: Math.min(qtys[l.item.id] ?? 0, l.max) }))
      .filter((l) => l.qty > 0);
    if (!picked.length) {
      toast.warning(t('orders.refundNothing'));
      return;
    }
    setBusy(true);
    try {
      const amount = await refundOrder({ order, lines: picked, reason, method, restock, user });
      toast.success(t('orders.refundDone', { amount: money(amount) }));
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('orders.refund')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || total <= 0} onClick={() => void submit()}>
            {t('orders.refundAmount')}: {money(total)}
          </Button>
        </>
      }
    >
      {lines.length === 0 ? (
        <p className="muted">{t('orders.alreadyRefunded')}</p>
      ) : (
        <div className="col gap-12">
          {lines.map(({ item, max }) => (
            <div key={item.id} className="row between gap-12">
              <div className="grow">
                <div className="strong">{item.name}</div>
                <div className="tiny dim">
                  {t('common.qty')}: {formatQty(max, lang)} · {money(item.total)}
                </div>
              </div>
              <div className="qty-stepper">
                <button
                  type="button"
                  onClick={() => setQtys({ ...qtys, [item.id]: Math.max(0, (qtys[item.id] ?? 0) - 1) })}
                >
                  −
                </button>
                <input
                  value={qtys[item.id] ?? 0}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/[^\d.]/g, ''));
                    setQtys({ ...qtys, [item.id]: Math.min(Number.isFinite(n) ? n : 0, max) });
                  }}
                />
                <button
                  type="button"
                  onClick={() => setQtys({ ...qtys, [item.id]: Math.min(max, (qtys[item.id] ?? 0) + 1) })}
                >
                  +
                </button>
              </div>
            </div>
          ))}

          <div className="divider" />

          <Field label={t('orders.refundReason')}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label={t('pay.method')}>
            <Select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
              {(Object.keys(METHOD_KEY) as PayMethod[]).map((m) => (
                <option key={m} value={m}>
                  {t(METHOD_KEY[m])}
                </option>
              ))}
            </Select>
          </Field>
          <Checkbox checked={restock} onChange={setRestock} label={t('orders.refundRestock')} />
        </div>
      )}
    </Modal>
  );
}
