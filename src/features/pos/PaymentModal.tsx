import { useState } from 'react';
import { Button, Field, Input, Modal, MoneyInput } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { CURRENCIES } from '@/core/money';
import { useApp, useMoney, useT } from '@/store/app';
import { useCart, useCartTotals } from '@/store/cart';
import { toast, useUI } from '@/store/ui';
import { payOrder, PaymentShortfallError, StockError } from '@/services/orders';
import { notifyOrderPaid } from '@/features/backup/useAutoBackup';
import { printDocument } from '@/print/PrintHost';
import { Receipt } from '@/print/Receipt';
import { RyoshushoModal } from '@/print/Ryoshusho';
import type { Order, PayMethod } from '@/db/types';
import type { TranslationKey } from '@/i18n';

const METHODS: { key: PayMethod; labelKey: TranslationKey; icon: string }[] = [
  { key: 'cash', labelKey: 'pay.cash', icon: 'wallet' },
  { key: 'card', labelKey: 'pay.card', icon: 'receipt' },
  { key: 'transfer', labelKey: 'pay.transfer', icon: 'upload' },
  { key: 'ewallet', labelKey: 'pay.ewallet', icon: 'grid' },
  { key: 'qr', labelKey: 'pay.qr', icon: 'grid' },
];

interface Entry {
  method: PayMethod;
  amount: number;
  ref: string;
}

export function PaymentModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const money = useMoney();
  const { settings, user, shift, reloadShift } = useApp();
  const cart = useCart();
  const totals = useCartTotals();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [method, setMethod] = useState<PayMethod>('cash');
  const [amount, setAmount] = useState(totals.total);
  /** True while the amount is the auto-filled one: the first quick-cash or
   *  keypad press replaces it, later presses add to what the cashier built. */
  const [fresh, setFresh] = useState(true);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Order | null>(null);
  const [showRyoshu, setShowRyoshu] = useState(false);

  const paidSoFar = entries.reduce((s, e) => s + e.amount, 0);
  const remaining = Math.max(0, totals.total - paidSoFar);

  const steps = CURRENCIES[settings.currency].quickCash;
  const decimals = CURRENCIES[settings.currency].decimals;

  const addCash = (value: number) => {
    setAmount(fresh ? value : amount + value);
    setFresh(false);
  };
  const typeDigit = (d: string) => {
    setAmount(appendDigit(fresh ? 0 : amount, d, settings.currency));
    setFresh(false);
  };

  const canUsePoints =
    settings.loyaltyEnabled && !!cart.customerId && cart.customerPoints > 0 && !done;

  const addEntry = () => {
    if (amount <= 0) return;
    const next = [...entries, { method, amount, ref: reference.trim() }];
    const nextPaid = next.reduce((s, e) => s + e.amount, 0);
    setEntries(next);
    setReference('');
    setAmount(Math.max(0, totals.total - nextPaid));
    setFresh(true);
  };

  const complete = async (allowDebt: boolean) => {
    const list = amount > 0 ? [...entries, { method, amount, ref: reference.trim() }] : entries;
    const paid = list.reduce((s, e) => s + e.amount, 0);
    if (paid < totals.total && !allowDebt) {
      toast.warning(t('pay.due') + ': ' + money(totals.total - paid));
      return;
    }
    if (allowDebt && !cart.customerId) {
      toast.error(t('pay.debtNeedsCustomer'));
      return;
    }
    setBusy(true);
    try {
      const order = await payOrder({
        cart,
        ctx: { user, settings, shiftId: shift?.id ?? null },
        payments: list,
        allowDebt,
      });
      await reloadShift();
      void notifyOrderPaid();
      setDone(order);
      if (settings.printAfterPay) printDocument(<Receipt order={order} />);
    } catch (err) {
      if (err instanceof PaymentShortfallError) {
        toast.warning(t('pay.due') + ': ' + money(err.total - err.paid));
        return;
      }
      if (err instanceof StockError) {
        useUI.getState().showStockAlert(t('pos.stockBlocked', { name: err.productName, n: err.available }));
        onClose();
        return;
      }
      console.error(err);
      toast.error(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    // Any way out of the receipt popup (button, X, tapping outside, Esc) ends the
    // sale: the paid items must not linger in the cart.
    const finish = () => {
      useCart.getState().clear();
      onClose();
    };
    return (
      <>
        <Modal
          open
          onClose={finish}
        size="sm"
        title={t('pay.success')}
        footer={
          <>
            <Button icon="print" onClick={() => printDocument(<Receipt order={done} />)}>
              {t('common.print')}
            </Button>
            <Button icon="receipt" onClick={() => setShowRyoshu(true)}>
              {t('orders.ryoshusho')}
            </Button>
            <span className="grow" />
            <Button
              variant="primary"
              onClick={finish}
            >
              {t('pay.newOrder')}
            </Button>
          </>
        }
      >
        <div className="center col gap-12" style={{ alignItems: 'center', paddingTop: 6 }}>
          <div className="stamp" role="img" aria-label={t('pay.success')}>
            <span className="stamp-word">{t('pay.stamp')}</span>
            <span className="stamp-code">{done.code}</span>
          </div>
          <div className="num paid-total">{money(done.total)}</div>
          {done.changeAmount > 0 && (
            <div className="callout callout-success w-full">
              <div className="row between">
                <span>{t('pay.change')}</span>
                <strong className="num" style={{ fontSize: 20 }}>
                  {money(done.changeAmount)}
                </strong>
              </div>
            </div>
          )}
          {done.dueAmount > 0 && (
            <div className="callout callout-warn w-full">
              <div className="row between">
                <span>{t('pay.due')}</span>
                <strong className="num">{money(done.dueAmount)}</strong>
              </div>
            </div>
          )}
          {done.pointsEarned > 0 && (
            <div className="small text-brand">{t('pay.pointsEarned', { n: done.pointsEarned })}</div>
          )}
        </div>
      </Modal>
      {showRyoshu && <RyoshushoModal order={done} onClose={() => setShowRyoshu(false)} />}
      </>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('pay.title')}
      footer={
        <>
          {cart.customerId && remaining > 0 && (
            <Button variant="soft" onClick={() => void complete(true)} disabled={busy}>
              {t('pay.debt')}
            </Button>
          )}
          <span className="grow" />
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" size="lg" disabled={busy} onClick={() => void complete(false)}>
            {settings.printAfterPay ? t('pay.completeAndPrint') : t('pay.complete')}
          </Button>
        </>
      }
    >
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="col gap-12">
          <div className="card card-pad">
            <div className="row between">
              <span className="muted">{t('common.total')}</span>
              <span className="num" style={{ fontSize: 26, fontWeight: 750 }}>
                {money(totals.total)}
              </span>
            </div>
            {entries.length > 0 && (
              <>
                <div className="divider" />
                {entries.map((e, i) => (
                  <div key={i} className="row between small" style={{ padding: '3px 0' }}>
                    <span>{t(METHODS.find((m) => m.key === e.method)?.labelKey ?? 'pay.cash')}</span>
                    <span className="row gap-8">
                      <span className="num">{money(e.amount)}</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-icon"
                        onClick={() => {
                          const next = entries.filter((_, j) => j !== i);
                          const nextPaid = next.reduce((s, x) => s + x.amount, 0);
                          setEntries(next);
                          setAmount(Math.max(0, totals.total - nextPaid));
                          setFresh(true);
                        }}
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </span>
                  </div>
                ))}
                <div className="row between strong mt-4">
                  <span>{t('pay.due')}</span>
                  <span className="num">{money(remaining)}</span>
                </div>
              </>
            )}
          </div>

          <div className="row wrap gap-4">
            {METHODS.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`chip ${method === m.key ? 'active' : ''}`}
                onClick={() => setMethod(m.key)}
              >
                {t(m.labelKey)}
              </button>
            ))}
          </div>

          <Field label={t('pay.received')}>
            <MoneyInput
              value={amount}
              onChange={(v) => {
                setAmount(v);
                setFresh(false);
              }}
              className="input-lg"
              initialFocus
            />
          </Field>

          {(method === 'transfer' || method === 'card' || method === 'qr') && (
            <Field label={t('pay.reference')}>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          )}

          {amount > remaining && method === 'cash' && (
            <div className="callout callout-success">
              <div className="row between">
                <span>{t('pay.change')}</span>
                <strong className="num" style={{ fontSize: 18 }}>
                  {money(amount - remaining)}
                </strong>
              </div>
            </div>
          )}

          {canUsePoints && (
            <div className="card card-pad">
              <div className="row between mb-8">
                <span className="label" style={{ margin: 0 }}>
                  {t('pay.usePoints')}
                </span>
                <span className="small dim">{t('pay.pointsAvailable', { n: cart.customerPoints })}</span>
              </div>
              <div className="row gap-8">
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={cart.customerPoints}
                  value={cart.pointsUsed}
                  onChange={(e) => useCart.getState().setPointsUsed(Number(e.target.value))}
                />
                <Button size="sm" onClick={() => useCart.getState().setPointsUsed(cart.customerPoints)}>
                  {t('common.all')}
                </Button>
                <Button size="sm" onClick={() => useCart.getState().setPointsUsed(0)}>
                  {t('common.reset')}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="col gap-12">
          <div className="quick-cash">
            <Button
              className="quick-exact"
              variant="soft"
              onClick={() => {
                setAmount(remaining);
                setFresh(true);
              }}
            >
              {t('pay.exact')} · {money(remaining)}
            </Button>
            {steps.map((value) => (
              <Button key={value} onClick={() => addCash(value)}>
                + {money(value)}
              </Button>
            ))}
          </div>

          <div className="keypad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button key={d} type="button" onClick={() => typeDigit(d)}>
                {d}
              </button>
            ))}
            <button
              type="button"
              className="keypad-clear"
              onClick={() => {
                setAmount(0);
                setFresh(false);
              }}
            >
              C
            </button>
            <button type="button" onClick={() => typeDigit('0')}>
              0
            </button>
            <button
              type="button"
              className="keypad-back"
              aria-label={t('pay.backspace')}
              onClick={() => {
                setAmount(Math.floor(amount / 10 ** decimals / 10) * 10 ** decimals);
                setFresh(false);
              }}
            >
              <Icon name="backspace" size={20} />
            </button>
          </div>

          <Button icon="plus" block onClick={addEntry} disabled={amount <= 0}>
            {t('pay.addPayment')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function appendDigit(current: number, digit: string, currency: 'VND' | 'JPY' | 'USD'): number {
  const decimals = CURRENCIES[currency].decimals;
  const major = current / 10 ** decimals;
  const next = Number(`${major}${digit}`.replace(/^0+(?=\d)/, ''));
  return Math.round(next * 10 ** decimals);
}
