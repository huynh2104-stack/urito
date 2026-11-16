import { useState } from 'react';
import { Button, ColorPicker, EmptyState, Field, Input, Modal } from '@/components/ui';
import { db } from '@/db/db';
import { newId } from '@/core/id';
import { PALETTE } from '@/db/defaults';
import { useT } from '@/store/app';
import { confirmDialog, toast } from '@/store/ui';
import type { Category } from '@/db/types';

export function CategoryManager({ categories }: { categories: Category[] }) {
  const t = useT();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);

  const remove = async (category: Category) => {
    const used = await db.products.where('categoryId').equals(category.id).count();
    const ok = await confirmDialog({
      title: t('common.confirmDelete', { name: category.name }),
      message: used ? `${used} ${t('common.items')}` : t('common.cannotUndo'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!ok) return;
    await db.transaction('rw', [db.categories, db.products], async () => {
      await db.categories.delete(category.id);
      const affected = await db.products.where('categoryId').equals(category.id).toArray();
      await db.products.bulkPut(affected.map((p) => ({ ...p, categoryId: '' })));
    });
    toast.success(t('common.deleted'));
  };

  const move = async (category: Category, delta: number) => {
    const sorted = [...categories].sort((a, b) => a.sort - b.sort);
    const index = sorted.findIndex((c) => c.id === category.id);
    const target = index + delta;
    if (target < 0 || target >= sorted.length) return;
    const swapped = [...sorted];
    [swapped[index], swapped[target]] = [swapped[target], swapped[index]];
    await db.categories.bulkPut(swapped.map((c, i) => ({ ...c, sort: i })));
  };

  return (
    <div className="mt-16">
      <div className="row end mb-12">
        <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
          {t('products.newCategory')}
        </Button>
      </div>

      <div className="card">
        {categories.length === 0 ? (
          <EmptyState icon="tag" title={t('common.empty')} />
        ) : (
          categories.map((c, i) => (
            <div key={c.id} className="list-row">
              <span className="color-dot" style={{ background: c.color, width: 14, height: 14 }} />
              <span className="grow strong">{c.name}</span>
              {!c.active && <span className="badge">{t('common.inactive')}</span>}
              <Button variant="ghost" size="sm" icon="arrowUp" disabled={i === 0} onClick={() => void move(c, -1)} />
              <Button
                variant="ghost"
                size="sm"
                icon="arrowDown"
                disabled={i === categories.length - 1}
                onClick={() => void move(c, 1)}
              />
              <Button variant="ghost" size="sm" icon="edit" onClick={() => setEditing(c)} />
              <Button variant="ghost" size="sm" icon="trash" onClick={() => void remove(c)} />
            </div>
          ))
        )}
      </div>

      {editing && (
        <CategoryForm
          category={editing === 'new' ? null : editing}
          nextSort={categories.length}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function CategoryForm({
  category,
  nextSort,
  onClose,
}: {
  category: Category | null;
  nextSort: number;
  onClose: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState(category?.color ?? PALETTE[nextSort % PALETTE.length]);

  const save = async () => {
    if (!name.trim()) return;
    const row: Category = {
      id: category?.id ?? newId('c'),
      name: name.trim(),
      color,
      sort: category?.sort ?? nextSort,
      active: category?.active ?? true,
    };
    await db.categories.put(row);
    toast.success(t('common.saved'));
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={category ? t('products.editCategory') : t('products.newCategory')}
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
        <Field label={t('common.name')} required>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('common.color')}>
          <ColorPicker value={color} onChange={setColor} colors={PALETTE} />
        </Field>
      </div>
    </Modal>
  );
}
