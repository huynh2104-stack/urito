import { useMemo, useState } from 'react';
import {
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  MoneyInput,
  SearchInput,
  Select,
  Stat,
  Textarea,
} from '@/components/ui';
import { db } from '@/db/db';
import { docPrefixes } from '@/db/defaults';
import { nextSeq } from '@/db/seq';
import { useLiveQuery } from '@/lib/useLiveQuery';
import { newId } from '@/core/id';
import { formatDateTime } from '@/core/date';
import { useApp, useMoney, useT } from '@/store/app';
import { confirmDialog, toast } from '@/store/ui';
import { normaliseCode, normaliseText } from '@/core/search';
import { downloadCsv, timestampedName } from '@/services/csv';
import { formatAmount } from '@/core/money';
import type { Customer, Order } from '@/db/types';

type Filter = 'all' | 'debt' | 'points';

export function CustomersPage() {
  const t = useT();
  const money = useMoney();
  const settings = useApp((s) => s.settings);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const [viewing, setViewing] = useState<Customer | null>(null);

  const customers = useLiveQuery(async () => db.customers.toArray(), [], []);

  const visible = useMemo(() => {
    let list = customers.filter((c) => c.active);
    if (filter === 'debt') list = list.filter((c) => c.debt > 0);
    if (filter === 'points') list = list.filter((c) => c.points > 0);
    const q = normaliseText(search.trim());
    const phoneQ = normaliseCode(search);
    if (q) {
      list = list.filter(
        (c) => normaliseText(c.name).includes(q) || normaliseCode(c.phone).includes(phoneQ),
      );
    }
    return list.sort((a, b) => b.totalSpent - a.totalSpent);
  }, [customers, filter, search]);

  const totalDebt = customers.reduce((s, c) => s + c.debt, 0);

  const exportCsv = () => {
    downloadCsv(timestampedName('urito-customers'), [
      [
        t('common.code'),
        t('common.name'),
        t('common.phone'),
        t('common.address'),
        t('cus.points'),
        t('cus.debt'),
        t('cus.totalSpent'),
        t('cus.orderCount'),
      ],
      ...visible.map((c) => [
        c.code,
        c.name,
        c.phone,
        c.address,
        c.points,
        formatAmount(c.debt, settings.currency, 'en'),
        formatAmount(c.totalSpent, settings.currency, 'en'),
        c.orderCount,
      ]),
    ]);
  };

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <div className="page-title">{t('cus.title')}</div>
          <div className="page-sub">{visible.length}</div>
        </div>
        <div className="row gap-8">
          <Button icon="download" onClick={exportCsv} disabled={!visible.length}>
            {t('common.export')}
          </Button>
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            {t('cus.new')}
          </Button>
        </div>
      </div>

      <div className="grid grid-3 mb-16">
        <Stat label={t('cus.title')} value={String(customers.filter((c) => c.active).length)} />
        <Stat label={t('cus.debt')} value={money(totalDebt)} tone={totalDebt ? 'warn' : undefined} />
        <Stat
          label={t('cus.totalSpent')}
          value={money(customers.reduce((s, c) => s + c.totalSpent, 0))}
        />
      </div>

      <div className="card card-pad mb-16">
        <div className="row gap-8 wrap">
          <SearchInput value={search} onChange={setSearch} placeholder={t('cus.searchPlaceholder')} />
          <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} style={{ width: 180 }}>
            <option value="all">{t('common.all')}</option>
            <option value="debt">{t('cus.hasDebt')}</option>
            <option value="points">{t('cus.points')}</option>
          </Select>
        </div>
      </div>

      <div className="card">
        {visible.length === 0 ? (
          <EmptyState icon="users" title={t('cus.noCustomers')} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th>{t('common.phone')}</th>
                  <th className="right">{t('cus.orderCount')}</th>
                  <th className="right">{t('cus.totalSpent')}</th>
                  {settings.loyaltyEnabled && <th className="right">{t('cus.points')}</th>}
                  <th className="right">{t('cus.debt')}</th>
                  <th className="right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => setViewing(c)}>
                    <td>
                      <div className="strong">{c.name}</div>
                      <div className="tiny dim">{c.code}</div>
                    </td>
                    <td>{c.phone || '—'}</td>
                    <td className="right num">{c.orderCount}</td>
                    <td className="right num">{money(c.totalSpent)}</td>
                    {settings.loyaltyEnabled && <td className="right num">{c.points}</td>}
                    <td className={`right num ${c.debt > 0 ? 'text-danger strong' : 'dim'}`}>
                      {c.debt > 0 ? money(c.debt) : '—'}
                    </td>
                    <td className="right" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" icon="edit" onClick={() => setEditing(c)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && <CustomerForm customer={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {viewing && <CustomerDetail customer={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function CustomerForm({
  customer,
  onClose,
}: {
  customer: Customer | null;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useApp((s) => s.settings.lang);
  const [draft, setDraft] = useState<Customer>(
    () =>
      customer ?? {
        id: newId('cu'),
        code: '',
        name: '',
        phone: '',
        address: '',
        note: '',
        points: 0,
        debt: 0,
        totalSpent: 0,
        orderCount: 0,
        birthday: '',
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
  );

  const set = <K extends keyof Customer>(key: K, value: Customer[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    if (!draft.name.trim()) return;
    await db.transaction('rw', [db.customers, db.kv], async () => {
      const prefix = docPrefixes(lang).customer;
      const code = draft.code || `${prefix}${String(await nextSeq('customer')).padStart(4, '0')}`;
      await db.customers.put({ ...draft, code, name: draft.name.trim(), updatedAt: Date.now() });
    });
    toast.success(t('common.saved'));
    onClose();
  };

  const remove = async () => {
    if (!customer) return;
    const ok = await confirmDialog({
      title: t('common.confirmDelete', { name: customer.name }),
      message: t('common.cannotUndo'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!ok) return;
    await db.customers.update(customer.id, { active: false });
    toast.success(t('common.deleted'));
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={customer ? t('cus.edit') : t('cus.new')}
      footer={
        <>
          {customer && (
            <Button variant="danger" onClick={() => void remove()}>
              {t('common.delete')}
            </Button>
          )}
          <span className="grow" />
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => void save()} disabled={!draft.name.trim()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="col gap-12">
        <div className="grid grid-2">
          <Field label={t('common.name')} required>
            <Input initialFocus value={draft.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label={t('common.phone')}>
            <Input value={draft.phone} inputMode="tel" onChange={(e) => set('phone', e.target.value)} />
          </Field>
        </div>
        <Field label={t('common.address')}>
          <Input value={draft.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <div className="grid grid-2">
          <Field label={t('cus.birthday')}>
            <Input type="date" value={draft.birthday} onChange={(e) => set('birthday', e.target.value)} />
          </Field>
          <Field label={t('cus.points')}>
            <Input
              type="number"
              value={draft.points}
              onChange={(e) => set('points', Number(e.target.value) || 0)}
            />
          </Field>
        </div>
        <Field label={t('common.note')}>
          <Textarea value={draft.note} onChange={(e) => set('note', e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function CustomerDetail({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const t = useT();
  const money = useMoney();
  const lang = useApp((s) => s.settings.lang);
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState(customer.debt);

  const orders = useLiveQuery(
    async () =>
      (await db.orders.where('customerId').equals(customer.id).toArray()).sort(
        (a, b) => (b.paidAt || b.createdAt) - (a.paidAt || a.createdAt),
      ),
    [customer.id],
    [] as Order[],
  );

  const current = useLiveQuery(async () => db.customers.get(customer.id), [customer.id], customer);
  const debt = current?.debt ?? customer.debt;

  const collect = async () => {
    const value = Math.min(amount, debt);
    if (value <= 0) return;
    await db.customers.update(customer.id, { debt: debt - value, updatedAt: Date.now() });
    toast.success(t('cus.debtPaid', { amount: money(value) }));
    setPaying(false);
  };

  return (
    <Modal open onClose={onClose} size="lg" title={customer.name}>
      <div className="col gap-16">
        <div className="grid grid-4">
          <Stat label={t('cus.orderCount')} value={String(current?.orderCount ?? 0)} />
          <Stat label={t('cus.totalSpent')} value={money(current?.totalSpent ?? 0)} />
          <Stat label={t('cus.points')} value={String(current?.points ?? 0)} />
          <Stat label={t('cus.debt')} value={money(debt)} tone={debt > 0 ? 'danger' : undefined} />
        </div>

        {debt > 0 && (
          <div className="callout callout-warn">
            <div className="row between wrap gap-8">
              <span>
                {t('cus.debt')}: <strong>{money(debt)}</strong>
              </span>
              {paying ? (
                <span className="row gap-8">
                  <div style={{ width: 160 }}>
                    <MoneyInput value={amount} onChange={setAmount} initialFocus />
                  </div>
                  <Button variant="primary" size="sm" onClick={() => void collect()}>
                    {t('common.confirm')}
                  </Button>
                  <Button size="sm" onClick={() => setPaying(false)}>
                    {t('common.cancel')}
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="primary" onClick={() => setPaying(true)}>
                  {t('cus.payDebt')}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-head">
            <span className="card-title">{t('cus.history')}</span>
          </div>
          {orders.length === 0 ? (
            <EmptyState icon="receipt" title={t('orders.noOrders')} />
          ) : (
            <div className="table-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>{t('orders.code')}</th>
                    <th>{t('common.date')}</th>
                    <th className="right">{t('common.total')}</th>
                    <th>{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 60).map((o) => (
                    <tr key={o.id}>
                      <td className="strong">{o.code}</td>
                      <td className="dim nowrap">{formatDateTime(o.paidAt || o.createdAt, lang)}</td>
                      <td className="right num">{money(o.total)}</td>
                      <td>
                        <span className={`badge ${o.status === 'paid' ? 'badge-success' : ''}`}>{o.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
