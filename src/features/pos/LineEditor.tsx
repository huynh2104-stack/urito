import { useState } from 'react';
import { Button, Field, Input, Modal, MoneyInput, NumberInput } from '@/components/ui';
import { useMoney, useT } from '@/store/app';
import { useCart } from '@/store/cart';
import type { DiscountType, ModifierGroup, ModifierOption, OrderItemModifier } from '@/db/types';

export function LineEditorModal({
  lineId,
  modifierGroups,
  onClose,
}: {
  lineId: string;
  modifierGroups: ModifierGroup[];
  onClose: () => void;
}) {
  const t = useT();
  const money = useMoney();
  const item = useCart((s) => s.items.find((i) => i.id === lineId));

  const [qty, setQty] = useState(item?.qty ?? 1);
  const [note, setNote] = useState(item?.note ?? '');
  const [discountType, setDiscountType] = useState<DiscountType>(item?.discountType ?? 'none');
  const [discountValue, setDiscountValue] = useState(item?.discountValue ?? 0);
  const [modifiers, setModifiers] = useState<OrderItemModifier[]>(item?.modifiers ?? []);

  if (!item) return null;

  const usedGroups = modifierGroups.filter((g) =>
    g.options.some((o) => modifiers.some((m) => m.id === o.id)),
  );

  const toggle = (group: ModifierGroup, option: ModifierOption) => {
    const has = modifiers.some((m) => m.id === option.id);
    if (has) {
      setModifiers(modifiers.filter((m) => m.id !== option.id));
      return;
    }
    const withoutGroup = group.multiple
      ? modifiers
      : modifiers.filter((m) => !group.options.some((o) => o.id === m.id));
    setModifiers([...withoutGroup, { id: option.id, name: option.name, priceDelta: option.priceDelta }]);
  };

  const save = () => {
    const cart = useCart.getState();
    cart.setLineModifiers(lineId, modifiers);
    cart.setLineNote(lineId, note.trim());
    cart.setLineDiscount(lineId, discountType, discountType === 'none' ? 0 : discountValue);
    cart.setQty(lineId, qty);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={item.name}
      footer={
        <>
          <Button
            variant="danger"
            onClick={() => {
              useCart.getState().removeLine(lineId);
              onClose();
            }}
          >
            {t('common.delete')}
          </Button>
          <span className="grow" />
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={save}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="col gap-16">
        <div className="row gap-12">
          <Field label={t('common.quantity')}>
            <NumberInput value={qty} onChange={setQty} min={0} step={1} />
          </Field>
          <Field label={t('common.price')}>
            <Input value={money(item.price)} disabled />
          </Field>
        </div>

        {usedGroups.length > 0 && (
          <div className="col gap-12">
            {usedGroups.map((group) => (
              <div key={group.id}>
                <div className="label mb-8">{group.name}</div>
                <div className="row wrap gap-8">
                  {group.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`chip ${modifiers.some((m) => m.id === option.id) ? 'active' : ''}`}
                      onClick={() => toggle(group, option)}
                    >
                      {option.name}
                      {option.priceDelta !== 0 && (
                        <span style={{ marginLeft: 6, opacity: 0.85 }}>
                          {option.priceDelta > 0 ? '+' : ''}
                          {money(option.priceDelta)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <Field label={t('pos.itemDiscount')}>
          <div className="row gap-8">
            <div className="btn-group">
              <button
                type="button"
                className={`btn btn-sm ${discountType === 'none' ? 'active' : ''}`}
                onClick={() => setDiscountType('none')}
              >
                {t('common.none')}
              </button>
              <button
                type="button"
                className={`btn btn-sm ${discountType === 'percent' ? 'active' : ''}`}
                onClick={() => setDiscountType('percent')}
              >
                %
              </button>
              <button
                type="button"
                className={`btn btn-sm ${discountType === 'amount' ? 'active' : ''}`}
                onClick={() => setDiscountType('amount')}
              >
                {t('common.money')}
              </button>
            </div>
            {discountType === 'percent' && (
              <NumberInput value={discountValue} onChange={setDiscountValue} min={0} max={100} />
            )}
            {discountType === 'amount' && <MoneyInput value={discountValue} onChange={setDiscountValue} />}
          </div>
        </Field>

        <Field label={t('pos.itemNote')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
