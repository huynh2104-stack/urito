import { useMemo, useState } from 'react';
import { Button, EmptyState, Field, Input, Modal, SearchInput, Stat, Textarea } from '@/components/ui';
import { db } from '@/db/db';
import { useLiveQuery } from '@/lib/useLiveQuery';
import { newId } from '@/core/id';
import { useMoney, useT } from '@/store/app';
import { confirmDialog, toast } from '@/store/ui';
import { removeTones } from '@/features/pos/PosPage';
import { navigate } from '@/router';
import type { Supplier } from '@/db/types';

export function SuppliersPage() {
  const t = useT();
  const money = useMoney();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);

  const suppliers = useLiveQuery(async () => db.suppliers.toArray(), [], []);

  const visible = useMemo(() => {
    const q = removeTones(search.trim().toLowerCase());
    return suppliers
      .filter((s) => s.active)
      .filter((s) => !q || removeTones(s.name.toLowerCase()).includes(q) || s.phone.includes(search.trim()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [suppliers, search]);

  const totalDebt = visible.reduce((s, x) => s + x.debt, 0);

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <div className="page-title">{t('sup.title')}</div>
          <div className="page-sub">{visible.length}</div>
        </div>
        <div className="row gap-8">
          <Button icon="truck" onClick={() => navigate('/purchases')}>
            {t('pur.title')}
          </Button>
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            {t('sup.new')}
          </Button>
        </div>
      </div>

      <div className="grid grid-2 mb-16">
        <Stat label={t('sup.title')} value={String(visible.length)} />
        <Stat label={t('sup.debt')} value={money(totalDebt)} tone={totalDebt ? 'warn' : undefined} />
      </div>

      <div className="card card-pad mb-16">
        <SearchInput value={search} onChange={setSearch} placeholder={t('common.searchPlaceholder')} />
      </div>

      <div className="card">
        {visible.length === 0 ? (
          <EmptyState icon="store" title={t('sup.noSuppliers')} />
        ) : (
          visible.map((s) => (
            <div key={s.id} className="list-row">
              <div className="grow">
                <div className="strong">{s.name}</div>
                <div className="tiny dim">
                  {s.phone || '—'}
                  {s.address ? ` · ${s.address}` : ''}
                </div>
              </div>
              {s.debt > 0 && <span className="badge badge-warn num">{money(s.debt)}</span>}
              <Button variant="ghost" size="sm" icon="edit" onClick={() => setEditing(s)} />
            </div>
          ))
        )}
      </div>

      {editing && (
        <SupplierForm supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function SupplierForm({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const t = useT();
  const [draft, setDraft] = useState<Supplier>(
    () =>
      supplier ?? {
        id: newId('sp'),
        name: '',
        phone: '',
        address: '',
        note: '',
        debt: 0,
        active: true,
        createdAt: Date.now(),
      },
  );

  const set = <K extends keyof Supplier>(key: K, value: Supplier[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    if (!draft.name.trim()) return;
    await db.suppliers.put({ ...draft, name: draft.name.trim() });
    toast.success(t('common.saved'));
    onClose();
  };

  const remove = async () => {
    if (!supplier) return;
    const ok = await confirmDialog({
      title: t('common.confirmDelete', { name: supplier.name }),
      message: t('common.cannotUndo'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!ok) return;
    await db.suppliers.update(supplier.id, { active: false });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={supplier ? t('sup.edit') : t('sup.new')}
      footer={
        <>
          {supplier && (
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
        <Field label={t('common.name')} required>
          <Input autoFocus value={draft.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label={t('common.phone')}>
          <Input value={draft.phone} inputMode="tel" onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label={t('common.address')}>
          <Input value={draft.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label={t('common.note')}>
          <Textarea value={draft.note} onChange={(e) => set('note', e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
