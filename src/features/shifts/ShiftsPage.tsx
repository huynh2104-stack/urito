import { useEffect, useState } from 'react';
import { Button, EmptyState, Field, Input, Modal, MoneyInput, Stat, Textarea } from '@/components/ui';
import { db } from '@/db/db';
import { useLiveQuery } from '@/lib/useLiveQuery';
import { formatDateTime, formatDuration, formatTime } from '@/core/date';
import { useApp, useMoney, useT } from '@/store/app';
import { toast } from '@/store/ui';
import { addCashMovement, closeShift, loadShiftData, openShift, type ShiftTotals } from '@/services/shifts';
import { printDocument } from '@/print/PrintHost';
import { ShiftReceipt } from '@/print/ShiftReceipt';
import { navigate, useRoute } from '@/router';
import type { CashMovement, Shift } from '@/db/types';

export function ShiftsPage() {
  const t = useT();
  const money = useMoney();
  const { user, shift, reloadShift, settings, signOut, users } = useApp();
  const route = useRoute();
  const handoverRequested = route.query.get('handover') === '1';
  const [handover, setHandover] = useState(false);

  const [totals, setTotals] = useState<ShiftTotals | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [cashDialog, setCashDialog] = useState<'in' | 'out' | null>(null);

  const history = useLiveQuery(
    async () => (await db.shifts.toArray()).sort((a, b) => b.openedAt - a.openedAt),
    [],
    [] as Shift[],
  );
  const orderCount = useLiveQuery(
    async () => (shift ? db.orders.where('shiftId').equals(shift.id).count() : 0),
    [shift?.id],
    0,
  );

  useEffect(() => {
    if (handoverRequested && shift) {
      setHandover(true);
      setShowClose(true);
      navigate('/shifts', true);
    }
  }, [handoverRequested, shift]);

  useEffect(() => {
    if (!shift) {
      setTotals(null);
      setMovements([]);
      return;
    }
    let cancelled = false;
    void loadShiftData(shift).then((data) => {
      if (cancelled) return;
      setTotals(data.totals);
      setMovements(data.movements);
    });
    return () => {
      cancelled = true;
    };
  }, [shift, orderCount]);

  const doOpen = async (openingCash: number, note: string) => {
    if (!user) return;
    const created = await openShift(user, openingCash, note);
    await reloadShift();
    setShowOpen(false);
    toast.success(t('shift.opened', { time: formatTime(created.openedAt, settings.lang) }));
  };

  const doClose = async (counted: number, note: string) => {
    if (!shift) return;
    const closed = await closeShift(shift, counted, note);
    const data = await loadShiftData(closed);
    await reloadShift();
    setShowClose(false);
    toast.success(t('shift.closed'));
    printDocument(<ShiftReceipt shift={closed} totals={data.totals} />);
    // Handover: the drawer is counted, now hand the screen to the next person.
    if (handover && users.length > 1) {
      setHandover(false);
      setTimeout(() => void signOut(), 400);
    }
  };

  const addCash = async (type: 'in' | 'out', amount: number, reason: string) => {
    if (!shift || amount <= 0) return;
    await addCashMovement(shift, type, amount, reason, '', user);
    const data = await loadShiftData(shift);
    setTotals(data.totals);
    setMovements(data.movements);
    setCashDialog(null);
    toast.success(t('common.saved'));
  };

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <div className="page-title">{t('shift.title')}</div>
          <div className="page-sub">
            {shift ? `${shift.code} · ${t('shift.ownedBy', { name: shift.userName })}` : t('shift.noShift')}
          </div>
        </div>
        {shift ? (
          <div className="row gap-8">
            <Button icon="download" onClick={() => setCashDialog('in')}>
              {t('shift.cashIn')}
            </Button>
            <Button icon="upload" onClick={() => setCashDialog('out')}>
              {t('shift.cashOut')}
            </Button>
            <Button icon="lock" onClick={() => setShowClose(true)}>
              {t('shift.close')}
            </Button>
            {users.length > 1 && (
              <Button
                variant="primary"
                icon="users"
                onClick={() => {
                  setHandover(true);
                  setShowClose(true);
                }}
              >
                {t('shift.handover')}
              </Button>
            )}
          </div>
        ) : (
          <Button variant="primary" icon="clock" onClick={() => setShowOpen(true)}>
            {t('shift.open')}
          </Button>
        )}
      </div>

      {!shift ? (
        <div className="card">
          <EmptyState
            icon="clock"
            title={t('shift.noShift')}
            description={t('shift.noShiftHint')}
            action={
              <Button variant="primary" onClick={() => setShowOpen(true)}>
                {t('shift.open')}
              </Button>
            }
          />
        </div>
      ) : (
        totals && (
          <>
            <div className="grid grid-4 mb-16">
              <Stat
                label={t('shift.duration')}
                value={formatDuration(Date.now() - shift.openedAt, settings.lang)}
                hint={`${formatTime(shift.openedAt, settings.lang)} →`}
              />
              <Stat label={t('rep.orderCount')} value={String(totals.orderCount)} />
              <Stat label={t('rep.revenue')} value={money(totals.totalSales)} />
              <Stat label={t('shift.expectedCash')} value={money(totals.expectedCash)} tone="success" />
            </div>

            <div className="grid grid-2">
              <div className="card">
                <div className="card-head">
                  <span className="card-title">{t('shift.report')}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="print"
                    onClick={() => printDocument(<ShiftReceipt shift={shift} totals={totals} />)}
                  />
                </div>
                <div className="card-body col gap-4">
                  <Line label={t('shift.openingCash')} value={money(shift.openingCash)} />
                  <Line label={t('shift.cashSales')} value={money(totals.cashSales)} />
                  <Line label={t('shift.nonCashSales')} value={money(totals.nonCashSales)} />
                  <Line label={t('shift.cashIn')} value={money(totals.cashIn)} />
                  <Line label={t('shift.cashOut')} value={`-${money(totals.cashOut)}`} />
                  {totals.expenseCash > 0 && <Line label={t('exp.title')} value={`-${money(totals.expenseCash)}`} />}
                  {totals.refundTotal > 0 && <Line label={t('rep.refunds')} value={`-${money(totals.refundTotal)}`} />}
                  <div className="divider" style={{ margin: '6px 0' }} />
                  <Line label={t('shift.expectedCash')} value={money(totals.expectedCash)} strong />
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <span className="card-title">{t('shift.movements')}</span>
                </div>
                {movements.length === 0 ? (
                  <EmptyState icon="wallet" title={t('common.empty')} />
                ) : (
                  <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                    {movements.map((m) => (
                      <div key={m.id} className="list-row">
                        <div className="grow">
                          <div className="strong">{m.reason || (m.type === 'in' ? t('shift.cashIn') : t('shift.cashOut'))}</div>
                          <div className="tiny dim">
                            {formatTime(m.at, settings.lang)} · {m.userName}
                          </div>
                        </div>
                        <span className={`num strong ${m.type === 'in' ? 'text-success' : 'text-danger'}`}>
                          {m.type === 'in' ? '+' : '-'}
                          {money(m.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )
      )}

      <div className="card mt-16">
        <div className="card-head">
          <span className="card-title">{t('shift.history')}</span>
        </div>
        {history.filter((s) => s.status === 'closed').length === 0 ? (
          <EmptyState icon="clock" title={t('common.empty')} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.code')}</th>
                  <th>{t('common.employee')}</th>
                  <th>{t('common.from')}</th>
                  <th>{t('common.to')}</th>
                  <th className="right">{t('rep.orderCount')}</th>
                  <th className="right">{t('rep.revenue')}</th>
                  <th className="right">{t('shift.overShort')}</th>
                </tr>
              </thead>
              <tbody>
                {history
                  .filter((s) => s.status === 'closed')
                  .map((s) => (
                    <tr key={s.id}>
                      <td className="strong">{s.code}</td>
                      <td>{s.userName}</td>
                      <td className="nowrap dim">{formatDateTime(s.openedAt, settings.lang)}</td>
                      <td className="nowrap dim">{formatDateTime(s.closedAt, settings.lang)}</td>
                      <td className="right num">{s.orderCount}</td>
                      <td className="right num">{money(s.totalSales)}</td>
                      <td
                        className={`right num strong ${s.difference === 0 ? '' : s.difference > 0 ? 'text-success' : 'text-danger'}`}
                      >
                        {s.difference === 0
                          ? t('shift.balanced')
                          : `${s.difference > 0 ? '+' : ''}${money(s.difference)}`}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showOpen && <OpenShiftModal onClose={() => setShowOpen(false)} onSubmit={doOpen} />}
      {showClose && shift && totals && (
        <CloseShiftModal
          expected={totals.expectedCash}
          handover={handover}
          onClose={() => {
            setShowClose(false);
            setHandover(false);
          }}
          onSubmit={doClose}
        />
      )}
      {cashDialog && (
        <CashMovementModal
          type={cashDialog}
          onClose={() => setCashDialog(null)}
          onSubmit={(amount, reason) => void addCash(cashDialog, amount, reason)}
        />
      )}
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="row between" style={{ fontWeight: strong ? 700 : undefined }}>
      <span className={strong ? '' : 'muted'}>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

function OpenShiftModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (cash: number, note: string) => void;
}) {
  const t = useT();
  const [cash, setCash] = useState(0);
  const [note, setNote] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('shift.open')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => onSubmit(cash, note)}>
            {t('shift.open')}
          </Button>
        </>
      }
    >
      <div className="col gap-12">
        <Field label={t('shift.openingCash')}>
          <MoneyInput value={cash} onChange={setCash} className="input-lg" autoFocus />
        </Field>
        <Field label={t('common.note')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function CloseShiftModal({
  expected,
  handover,
  onClose,
  onSubmit,
}: {
  expected: number;
  handover: boolean;
  onClose: () => void;
  onSubmit: (counted: number, note: string) => void;
}) {
  const t = useT();
  const money = useMoney();
  const [counted, setCounted] = useState(expected);
  const [note, setNote] = useState('');
  const diff = counted - expected;

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={handover ? t('shift.handover') : t('shift.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => onSubmit(counted, note)}>
            {t('shift.closeConfirm')}
          </Button>
        </>
      }
    >
      <div className="col gap-12">
        {handover && <div className="callout callout-success">{t('shift.handoverHint')}</div>}
        <div className="callout">
          {t('shift.expectedCash')}: <strong className="num">{money(expected)}</strong>
        </div>
        <Field label={t('shift.countedCash')}>
          <MoneyInput value={counted} onChange={setCounted} className="input-lg" autoFocus />
        </Field>
        <div className={`callout ${diff === 0 ? 'callout-success' : diff > 0 ? '' : 'callout-danger'}`}>
          <div className="row between">
            <span>{t('shift.difference')}</span>
            <strong className="num">
              {diff === 0 ? t('shift.balanced') : `${diff > 0 ? '+' : ''}${money(diff)}`}
            </strong>
          </div>
        </div>
        <Field label={t('common.note')}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function CashMovementModal({
  type,
  onClose,
  onSubmit,
}: {
  type: 'in' | 'out';
  onClose: () => void;
  onSubmit: (amount: number, reason: string) => void;
}) {
  const t = useT();
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={type === 'in' ? t('shift.addCashIn') : t('shift.addCashOut')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={amount <= 0} onClick={() => onSubmit(amount, reason)}>
            {t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="col gap-12">
        <Field label={t('common.amount')}>
          <MoneyInput value={amount} onChange={setAmount} className="input-lg" autoFocus />
        </Field>
        <Field label={t('shift.reason')}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
