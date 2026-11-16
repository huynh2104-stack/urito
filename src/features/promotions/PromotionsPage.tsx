import { useState } from 'react';
import { Button, Checkbox, EmptyState, Field, Input, Modal, MoneyInput, NumberInput, Select } from '@/components/ui';
import { db } from '@/db/db';
import { useLiveQuery } from '@/lib/useLiveQuery';
import { newId } from '@/core/id';
import { formatDate, fromDateInput, toDateInput } from '@/core/date';
import { useApp, useMoney, useT } from '@/store/app';
import { confirmDialog, toast } from '@/store/ui';
import type { Promotion } from '@/db/types';

export function PromotionsPage() {
  const t = useT();
  const money = useMoney();
  const lang = useApp((s) => s.settings.lang);
  const [editing, setEditing] = useState<Promotion | 'new' | null>(null);

  const promotions = useLiveQuery(async () => db.promotions.toArray(), [], []);

  const remove = async (promo: Promotion) => {
    const ok = await confirmDialog({
      title: t('common.confirmDelete', { name: promo.name }),
      message: t('common.cannotUndo'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!ok) return;
    await db.promotions.delete(promo.id);
    toast.success(t('common.deleted'));
  };

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <div className="page-title">{t('promo.title')}</div>
          <div className="page-sub">{promotions.length}</div>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
          {t('promo.new')}
        </Button>
      </div>

      <div className="card">
        {promotions.length === 0 ? (
          <EmptyState icon="tag" title={t('promo.noPromotions')} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th>{t('promo.code')}</th>
                  <th className="right">{t('promo.value')}</th>
                  <th className="right">{t('promo.minTotal')}</th>
                  <th>{t('promo.period')}</th>
                  <th className="right">{t('promo.usage')}</th>
                  <th className="right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {promotions.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="strong">{p.name}</div>
                      {!p.active && <span className="badge">{t('common.inactive')}</span>}
                    </td>
                    <td className="mono">{p.code}</td>
                    <td className="right num strong">
                      {p.type === 'percent' ? `${p.value}%` : money(p.value)}
                    </td>
                    <td className="right num dim">{p.minTotal ? money(p.minTotal) : '—'}</td>
                    <td className="dim small">
                      {p.startAt || p.endAt
                        ? `${p.startAt ? formatDate(p.startAt, lang) : '—'} → ${p.endAt ? formatDate(p.endAt, lang) : '—'}`
                        : '—'}
                    </td>
                    <td className="right num">{p.usageCount}</td>
                    <td className="right">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="edit"
                        aria-label={t('common.edit')}
                        onClick={() => setEditing(p)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="trash"
                        aria-label={t('common.delete')}
                        onClick={() => void remove(p)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <PromotionForm promotion={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function PromotionForm({ promotion, onClose }: { promotion: Promotion | null; onClose: () => void }) {
  const t = useT();
  const [draft, setDraft] = useState<Promotion>(
    () =>
      promotion ?? {
        id: newId('pr'),
        name: '',
        code: '',
        type: 'percent',
        value: 10,
        minTotal: 0,
        active: true,
        startAt: 0,
        endAt: 0,
        usageCount: 0,
      },
  );

  const set = <K extends keyof Promotion>(key: K, value: Promotion[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    if (!draft.name.trim()) return;
    await db.promotions.put({
      ...draft,
      name: draft.name.trim(),
      code: draft.code.trim().toUpperCase(),
    });
    toast.success(t('common.saved'));
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={promotion ? t('common.edit') : t('promo.new')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => void save()} disabled={!draft.name.trim()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="col gap-12">
        <Field label={t('common.name')} required>
          <Input initialFocus value={draft.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label={t('promo.code')} hint="GIAM10, SALE2026...">
          <Input
            value={draft.code}
            onChange={(e) => set('code', e.target.value.toUpperCase())}
            className="mono"
          />
        </Field>
        <div className="grid grid-2">
          <Field label={t('common.type')}>
            <Select
              value={draft.type}
              onChange={(e) => set('type', e.target.value as Promotion['type'])}
            >
              <option value="percent">{t('common.percent')}</option>
              <option value="amount">{t('common.money')}</option>
            </Select>
          </Field>
          <Field label={t('promo.value')}>
            {draft.type === 'percent' ? (
              <NumberInput value={draft.value} onChange={(v) => set('value', v)} min={0} max={100} />
            ) : (
              <MoneyInput value={draft.value} onChange={(v) => set('value', v)} />
            )}
          </Field>
        </div>
        <Field label={t('promo.minTotal')}>
          <MoneyInput value={draft.minTotal} onChange={(v) => set('minTotal', v)} />
        </Field>
        <div className="grid grid-2">
          <Field label={t('common.from')}>
            <Input
              type="date"
              value={draft.startAt ? toDateInput(draft.startAt) : ''}
              onChange={(e) => set('startAt', e.target.value ? fromDateInput(e.target.value) : 0)}
            />
          </Field>
          <Field label={t('common.to')}>
            <Input
              type="date"
              value={draft.endAt ? toDateInput(draft.endAt) : ''}
              onChange={(e) => set('endAt', e.target.value ? fromDateInput(e.target.value, true) : 0)}
            />
          </Field>
        </div>
        <Checkbox checked={draft.active} onChange={(v) => set('active', v)} label={t('common.active')} />
      </div>
    </Modal>
  );
}
