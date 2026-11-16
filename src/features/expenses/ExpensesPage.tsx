import { useMemo, useState } from 'react';
import {
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  MoneyInput,
  Select,
  Stat,
} from '@/components/ui';
import { HBarList } from '@/components/charts';
import { db } from '@/db/db';
import { useLiveQuery } from '@/lib/useLiveQuery';
import { newId } from '@/core/id';
import { formatDateTime, rangeOf, toDateInput, fromDateInput, type RangePreset } from '@/core/date';
import { EXPENSE_CATEGORIES, PALETTE, type ExpenseCategoryKey } from '@/db/defaults';
import { useApp, useMoney, useT } from '@/store/app';
import { confirmDialog, toast } from '@/store/ui';
import { downloadCsv, timestampedName } from '@/services/csv';
import { formatAmount } from '@/core/money';
import { RANGE_PRESETS, RangePicker } from '@/features/reports/RangePicker';
import type { Expense, PayMethod } from '@/db/types';
import type { TranslationKey } from '@/i18n';

const CATEGORY_KEY: Record<ExpenseCategoryKey, TranslationKey> = {
  rent: 'exp.rent',
  salary: 'exp.salary',
  utilities: 'exp.utilities',
  supplies: 'exp.supplies',
  marketing: 'exp.marketing',
  maintenance: 'exp.maintenance',
  tax: 'exp.tax',
  other: 'exp.other',
};

export function ExpensesPage() {
  const t = useT();
  const money = useMoney();
  const settings = useApp((s) => s.settings);

  const weekStartsOn = settings.weekStartsOn ?? (settings.lang === 'ja' ? 0 : 1);
  const [preset, setPreset] = useState<RangePreset>('this_month');
  const [custom, setCustom] = useState(() => rangeOf('this_month', Date.now(), weekStartsOn));
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);

  const [now] = useState(() => Date.now());
  const range = preset === 'custom' ? custom : rangeOf(preset, now, weekStartsOn);
  const expenses = useLiveQuery(
    async () =>
      (await db.expenses.where('at').between(range.from, range.to, true, true).toArray()).sort(
        (a, b) => b.at - a.at,
      ),
    [range.from, range.to],
    [] as Expense[],
  );

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const remove = async (expense: Expense) => {
    const ok = await confirmDialog({
      title: t('common.delete'),
      message: t('common.cannotUndo'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!ok) return;
    await db.expenses.delete(expense.id);
    toast.success(t('common.deleted'));
  };

  const exportCsv = () =>
    downloadCsv(timestampedName('urito-expenses'), [
      [t('common.date'), t('exp.category'), t('common.amount'), t('pay.method'), t('common.note'), t('common.employee')],
      ...expenses.map((e) => [
        formatDateTime(e.at, settings.lang),
        t(CATEGORY_KEY[e.category as ExpenseCategoryKey] ?? 'exp.other'),
        formatAmount(e.amount, settings.currency, 'en'),
        e.method,
        e.note,
        e.userName,
      ]),
    ]);

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <div className="page-title">{t('exp.title')}</div>
          <div className="page-sub">{expenses.length}</div>
        </div>
        <div className="row gap-8">
          <RangePicker preset={preset} onPreset={setPreset} range={custom} onRange={setCustom} presets={RANGE_PRESETS} />
          <Button icon="download" onClick={exportCsv} disabled={!expenses.length}>
            {t('common.export')}
          </Button>
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            {t('exp.new')}
          </Button>
        </div>
      </div>

      <div className="grid grid-2 mb-16" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)' }}>
        <Stat label={t('exp.totalRange')} value={money(total)} tone={total ? 'danger' : undefined} />
        <div className="card card-pad">
          <HBarList
            rows={byCategory.map(([key, value], i) => ({
              key,
              label: t(CATEGORY_KEY[key as ExpenseCategoryKey] ?? 'exp.other'),
              value,
              color: PALETTE[i % PALETTE.length],
            }))}
            format={(v) => money(v)}
            emptyLabel={t('exp.noExpenses')}
          />
        </div>
      </div>

      <div className="card">
        {expenses.length === 0 ? (
          <EmptyState icon="wallet" title={t('exp.noExpenses')} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th>{t('exp.category')}</th>
                  <th>{t('common.note')}</th>
                  <th>{t('pay.method')}</th>
                  <th>{t('common.employee')}</th>
                  <th className="right">{t('common.amount')}</th>
                  <th className="right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap dim">{formatDateTime(e.at, settings.lang)}</td>
                    <td>
                      <span className="badge">{t(CATEGORY_KEY[e.category as ExpenseCategoryKey] ?? 'exp.other')}</span>
                    </td>
                    <td className="truncate">{e.note || '—'}</td>
                    <td className="dim">{e.method}</td>
                    <td className="dim">{e.userName}</td>
                    <td className="right num strong">{money(e.amount)}</td>
                    <td className="right">
                      <Button variant="ghost" size="sm" icon="edit" onClick={() => setEditing(e)} />
                      <Button variant="ghost" size="sm" icon="trash" onClick={() => void remove(e)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <ExpenseForm expense={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function ExpenseForm({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const t = useT();
  const { user, shift } = useApp();

  const [category, setCategory] = useState<string>(expense?.category ?? 'supplies');
  const [amount, setAmount] = useState(expense?.amount ?? 0);
  const [method, setMethod] = useState<PayMethod>(expense?.method ?? 'cash');
  const [note, setNote] = useState(expense?.note ?? '');
  const [at, setAt] = useState(() => expense?.at ?? Date.now());

  const save = async () => {
    if (amount <= 0) return;
    await db.expenses.put({
      id: expense?.id ?? newId('ex'),
      category,
      amount,
      note: note.trim(),
      method,
      shiftId: expense?.shiftId ?? shift?.id ?? null,
      userId: expense?.userId ?? user?.id ?? '',
      userName: expense?.userName ?? user?.name ?? '',
      at,
    });
    toast.success(t('common.saved'));
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={expense ? t('common.edit') : t('exp.new')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={amount <= 0} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="col gap-12">
        <Field label={t('exp.category')}>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(CATEGORY_KEY[c])}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.amount')} required>
          <MoneyInput value={amount} onChange={setAmount} className="input-lg" initialFocus />
        </Field>
        <div className="grid grid-2">
          <Field label={t('pay.method')}>
            <Select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
              <option value="cash">{t('pay.cash')}</option>
              <option value="transfer">{t('pay.transfer')}</option>
              <option value="card">{t('pay.card')}</option>
              <option value="ewallet">{t('pay.ewallet')}</option>
            </Select>
          </Field>
          <Field label={t('common.date')}>
            <Input
              type="date"
              value={toDateInput(at)}
              onChange={(e) => setAt(fromDateInput(e.target.value))}
            />
          </Field>
        </div>
        <Field label={t('common.note')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
