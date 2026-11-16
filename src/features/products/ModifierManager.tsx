import { useState } from 'react';
import { Button, Checkbox, EmptyState, Field, Input, Modal, MoneyInput } from '@/components/ui';
import { db } from '@/db/db';
import { newId } from '@/core/id';
import { useMoney, useT } from '@/store/app';
import { confirmDialog, toast } from '@/store/ui';
import type { ModifierGroup, ModifierOption } from '@/db/types';

export function ModifierManager({ groups }: { groups: ModifierGroup[] }) {
  const t = useT();
  const money = useMoney();
  const [editing, setEditing] = useState<ModifierGroup | 'new' | null>(null);

  const remove = async (group: ModifierGroup) => {
    const ok = await confirmDialog({
      title: t('common.confirmDelete', { name: group.name }),
      message: t('common.cannotUndo'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!ok) return;
    await db.transaction('rw', [db.modifierGroups, db.products], async () => {
      await db.modifierGroups.delete(group.id);
      const affected = await db.products.filter((p) => p.modifierGroupIds.includes(group.id)).toArray();
      await db.products.bulkPut(
        affected.map((p) => ({ ...p, modifierGroupIds: p.modifierGroupIds.filter((id) => id !== group.id) })),
      );
    });
    toast.success(t('common.deleted'));
  };

  return (
    <div className="mt-16">
      <div className="row end mb-12">
        <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
          {t('products.newModifierGroup')}
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className="card">
          <EmptyState icon="list" title={t('common.empty')} description={t('products.modifierGroups')} />
        </div>
      ) : (
        <div className="grid grid-2">
          {groups.map((g) => (
            <div key={g.id} className="card">
              <div className="card-head">
                <div className="row gap-8">
                  <span className="card-title">{g.name}</span>
                  {g.required && <span className="badge badge-warn">{t('common.required')}</span>}
                  {g.multiple && <span className="badge badge-info">{t('products.modifierMultiple')}</span>}
                </div>
                <div className="row gap-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="edit"
                    aria-label={t('common.edit')}
                    onClick={() => setEditing(g)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="trash"
                    aria-label={t('common.delete')}
                    onClick={() => void remove(g)}
                  />
                </div>
              </div>
              <div className="card-body">
                <div className="row wrap gap-4">
                  {g.options.map((o) => (
                    <span key={o.id} className="badge">
                      {o.name}
                      {o.priceDelta !== 0 ? ` ${o.priceDelta > 0 ? '+' : ''}${money(o.priceDelta)}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ModifierForm
          group={editing === 'new' ? null : editing}
          nextSort={groups.length}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ModifierForm({
  group,
  nextSort,
  onClose,
}: {
  group: ModifierGroup | null;
  nextSort: number;
  onClose: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(group?.name ?? '');
  const [required, setRequired] = useState(group?.required ?? false);
  const [multiple, setMultiple] = useState(group?.multiple ?? false);
  const [options, setOptions] = useState<ModifierOption[]>(
    group?.options ?? [{ id: newId('o'), name: '', priceDelta: 0 }],
  );

  const update = (index: number, patch: Partial<ModifierOption>) =>
    setOptions(options.map((o, i) => (i === index ? { ...o, ...patch } : o)));

  const save = async () => {
    const clean = options.filter((o) => o.name.trim()).map((o) => ({ ...o, name: o.name.trim() }));
    if (!name.trim() || !clean.length) return;
    await db.modifierGroups.put({
      id: group?.id ?? newId('m'),
      name: name.trim(),
      required,
      multiple,
      options: clean,
      sort: group?.sort ?? nextSort,
    });
    toast.success(t('common.saved'));
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={group ? t('common.edit') : t('products.newModifierGroup')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => void save()} disabled={!name.trim()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="col gap-16">
        <Field label={t('common.name')} required hint="Size, Topping, ...">
          <Input initialFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <div className="row gap-16">
          <Checkbox checked={required} onChange={setRequired} label={t('products.modifierRequired')} />
          <Checkbox checked={multiple} onChange={setMultiple} label={t('products.modifierMultiple')} />
        </div>

        <div>
          <div className="label mb-8">{t('products.modifierOptions')}</div>
          <div className="col gap-8">
            {options.map((option, i) => (
              <div key={option.id} className="row gap-8">
                <Input
                  value={option.name}
                  placeholder={t('common.name')}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
                <div style={{ width: 150 }}>
                  <MoneyInput value={option.priceDelta} onChange={(v) => update(i, { priceDelta: v })} />
                </div>
                <Button
                  variant="ghost"
                  icon="trash"
                  aria-label={t('common.delete')}
                  onClick={() => setOptions(options.filter((_, j) => j !== i))}
                />
              </div>
            ))}
          </div>
          <Button
            className="mt-8"
            icon="plus"
            size="sm"
            onClick={() => setOptions([...options, { id: newId('o'), name: '', priceDelta: 0 }])}
          >
            {t('products.addOption')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
