import { useState } from 'react';
import { Button, Field, Input, Modal, MoneyInput, NumberInput } from '@/components/ui';
import { newId } from '@/core/id';
import { useMoney, useT } from '@/store/app';
import { useCart } from '@/store/cart';
import type { Product } from '@/db/types';

/** 商品マスタ未登録の単品や臨時のサービスを、登録作業で会計を止めずに即座に販売するモーダル。 */
export function CustomItemModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const money = useMoney();
  const [name, setName] = useState('');
  const [price, setPrice] = useState(0);
  const [qty, setQty] = useState(1);

  const add = () => {
    if (price <= 0 || qty <= 0) return;
    const now = Date.now();
    const product: Product = {
      id: newId('custom-'),
      sku: '',
      barcode: '',
      name: name.trim() || t('pos.customItem'),
      categoryId: '',
      price,
      cost: 0,
      unit: '',
      trackStock: false,
      stock: 0,
      minStock: 0,
      isService: true,
      active: true,
      color: '',
      image: '',
      modifierGroupIds: [],
      favorite: false,
      sort: 0,
      createdAt: now,
      updatedAt: now,
    };
    useCart.getState().addProduct(product, { qty });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('pos.customItem')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={price <= 0 || qty <= 0} onClick={add}>
            {t('common.add')} · {money(Math.round(price * qty))}
          </Button>
        </>
      }
    >
      <div className="col gap-12">
        <Field label={t('common.price')} required>
          <MoneyInput value={price} onChange={setPrice} className="input-lg" initialFocus onEnter={add} />
        </Field>
        <div className="grid grid-2">
          <Field label={t('common.name')}>
            <Input value={name} placeholder={t('pos.customItem')} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('common.quantity')}>
            <NumberInput value={qty} onChange={setQty} min={0} step={1} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
