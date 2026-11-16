import { useState } from 'react';
import {
  Button,
  Checkbox,
  ColorPicker,
  Field,
  Input,
  Modal,
  MoneyInput,
  NumberInput,
  Select,
} from '@/components/ui';
import { db } from '@/db/db';
import { newId } from '@/core/id';
import { PALETTE } from '@/db/defaults';
import { useApp, useT } from '@/store/app';
import { toast } from '@/store/ui';
import { applyStockChanges } from '@/services/inventory';
import { squareThumb } from '@/lib/image';
import { generateInternalBarcode } from '@/lib/barcode';
import { Icon } from '@/components/Icon';
import { CameraScanner } from '@/components/CameraScanner';
import type { Category, ModifierGroup, Product } from '@/db/types';

const blank = (): Product => ({
  id: newId('p'),
  sku: '',
  barcode: '',
  name: '',
  categoryId: '',
  price: 0,
  cost: 0,
  unit: '',
  trackStock: true,
  stock: 0,
  minStock: 0,
  isService: false,
  active: true,
  color: PALETTE[0],
  image: '',
  modifierGroupIds: [],
  favorite: false,
  sort: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export function ProductForm({
  product,
  categories,
  modifierGroups,
  onClose,
}: {
  product: Product | null;
  categories: Category[];
  modifierGroups: ModifierGroup[];
  onClose: () => void;
}) {
  const t = useT();
  const user = useApp((s) => s.user);
  const isNew = !product;
  const [draft, setDraft] = useState<Product>(() => product ?? blank());
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);

  const set = <K extends keyof Product>(key: K, value: Product[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const pickImage = async (file: File) => {
    try {
      set('image', await squareThumb(file, 320));
    } catch {
      toast.error(t('common.error'));
    }
  };

  const makeBarcode = async () => {
    const all = await db.products.toArray();
    set('barcode', generateInternalBarcode(new Set(all.map((p) => p.barcode).filter(Boolean))));
  };

  const makeSku = async () => {
    const count = await db.products.count();
    set('sku', `SP${String(count + 1).padStart(4, '0')}`);
  };

  const margin = draft.price > 0 ? ((draft.price - draft.cost) / draft.price) * 100 : 0;

  const save = async (addAnother = false) => {
    if (!draft.name.trim()) return;
    setBusy(true);
    try {
      const next: Product = {
        ...draft,
        name: draft.name.trim(),
        sku: draft.sku.trim(),
        barcode: draft.barcode.trim(),
        updatedAt: Date.now(),
      };
      if (next.barcode) {
        const clash = await db.products.where('barcode').equals(next.barcode).first();
        if (clash && clash.id !== next.id && clash.active) {
          toast.error(t('products.barcodeTaken', { name: clash.name }));
          return;
        }
      }
      const before = product && product.id === next.id ? product.stock : 0;
      await db.products.put(next);

      // A stock figure typed straight into the form still belongs in the ledger.
      if (next.trackStock && !next.isService && next.stock !== before) {
        await db.transaction('rw', [db.products, db.stockMovements], async () => {
          await db.products.update(next.id, { stock: before });
          await applyStockChanges(
            [
              {
                productId: next.id,
                delta: next.stock - before,
                type: !product || product.id !== next.id ? 'init' : 'adjust',
                cost: next.cost,
                refType: 'product-form',
                note: '',
              },
            ],
            user,
          );
        });
      }

      toast.success(t('common.saved'));
      if (addAnother) setDraft({ ...blank(), categoryId: next.categoryId, color: next.color });
      else onClose();
    } catch {
      toast.error(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isNew ? t('products.new') : t('products.edit')}
      footer={
        <>
          {!isNew && (
            <Button
              icon="copy"
              onClick={() =>
                setDraft({
                  ...draft,
                  id: newId('p'),
                  name: `${draft.name} (2)`,
                  sku: '',
                  barcode: '',
                  stock: 0,
                  createdAt: Date.now(),
                })
              }
            >
              <span className="hide-sm">{t('common.duplicate')}</span>
            </Button>
          )}
          <span className="grow" />
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          {isNew && (
            <Button onClick={() => void save(true)} disabled={busy || !draft.name.trim()}>
              {t('common.saveAndNew')}
            </Button>
          )}
          <Button variant="primary" onClick={() => void save()} disabled={busy || !draft.name.trim()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="col gap-16">
        <div className="product-form-head">
          <label className="image-drop" title={t('products.image')}>
            {draft.image ? (
              <img src={draft.image} alt="" />
            ) : (
              <span className="image-drop-empty">
                <Icon name="image" size={26} />
                <span>{t('products.addImage')}</span>
              </span>
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void pickImage(file);
                e.target.value = '';
              }}
            />
          </label>
          <div className="col gap-12 grow">
        <div className="grid grid-2">
          <Field label={t('common.name')} required>
            <Input autoFocus value={draft.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label={t('common.category')}>
            <Select value={draft.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">{t('products.noCategory')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

          </div>
        </div>
        {draft.image && (
          <div className="row gap-8" style={{ marginTop: -8 }}>
            <Button size="sm" variant="ghost" icon="trash" onClick={() => set('image', '')}>
              {t('products.removeImage')}
            </Button>
          </div>
        )}

        <div className="grid grid-3">
          <Field label={t('common.price')} required>
            <MoneyInput value={draft.price} onChange={(v) => set('price', v)} />
          </Field>
          <Field label={t('common.cost')} hint={`${t('products.margin')}: ${margin.toFixed(0)}%`}>
            <MoneyInput value={draft.cost} onChange={(v) => set('cost', v)} />
          </Field>
          <Field label={t('common.unit')} hint="kg, ly, cái...">
            <Input value={draft.unit} onChange={(e) => set('unit', e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-2">
          <Field label={t('products.sku')}>
            <div className="input-group">
              <Input value={draft.sku} onChange={(e) => set('sku', e.target.value)} />
              <Button onClick={() => void makeSku()} title={t('products.autoCode')}>
                {t('products.auto')}
              </Button>
            </div>
          </Field>
          <Field label={t('products.barcode')} hint={t('products.barcodeHint')}>
            <div className="input-group">
              <Input
                value={draft.barcode}
                inputMode="numeric"
                onChange={(e) => set('barcode', e.target.value)}
              />
              <Button icon="scan" onClick={() => setScanning(true)} title={t('scan.title')} />
              <Button onClick={() => void makeBarcode()} title={t('products.autoCode')}>
                {t('products.auto')}
              </Button>
            </div>
          </Field>
        </div>

        <div className="card card-pad">
          <Checkbox
            checked={draft.isService}
            onChange={(v) => set('isService', v)}
            label={t('products.isService')}
          />
          {!draft.isService && (
            <>
              <div className="mt-8">
                <Checkbox
                  checked={draft.trackStock}
                  onChange={(v) => set('trackStock', v)}
                  label={t('products.trackStock')}
                />
              </div>
              {draft.trackStock && (
                <div className="grid grid-2 mt-12">
                  <Field label={t('inv.currentStock')}>
                    <NumberInput value={draft.stock} onChange={(v) => set('stock', v)} step={1} />
                  </Field>
                  <Field label={t('products.minStock')}>
                    <NumberInput value={draft.minStock} onChange={(v) => set('minStock', v)} min={0} />
                  </Field>
                </div>
              )}
            </>
          )}
        </div>

        {modifierGroups.length > 0 && (
          <Field label={t('products.modifiers')}>
            <div className="row wrap gap-8">
              {modifierGroups.map((g) => {
                const active = draft.modifierGroupIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    className={`chip ${active ? 'active' : ''}`}
                    onClick={() =>
                      set(
                        'modifierGroupIds',
                        active
                          ? draft.modifierGroupIds.filter((id) => id !== g.id)
                          : [...draft.modifierGroupIds, g.id],
                      )
                    }
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        <div className="grid grid-2">
          <Field label={t('common.color')}>
            <ColorPicker value={draft.color} onChange={(c) => set('color', c)} colors={PALETTE} />
          </Field>
          <div className="col gap-8">
            <Checkbox
              checked={draft.favorite}
              onChange={(v) => set('favorite', v)}
              label={t('products.favorite')}
            />
            <Checkbox checked={draft.active} onChange={(v) => set('active', v)} label={t('common.active')} />
          </div>
        </div>
      </div>
      {scanning && (
        <CameraScanner
          onClose={() => setScanning(false)}
          onDetect={(code) => {
            set('barcode', code);
            setScanning(false);
          }}
        />
      )}
    </Modal>
  );
}
