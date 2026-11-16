import { useMemo, useState } from 'react';
import { Button, Field, Input, Modal } from '@/components/ui';
import { useMoney, useT } from '@/store/app';
import { unitPriceOf } from '@/core/cart';
import type { ModifierGroup, ModifierOption, OrderItemModifier, Product } from '@/db/types';

export function ModifierModal({
  product,
  groups,
  onClose,
  onConfirm,
  initial,
}: {
  product: Product;
  groups: ModifierGroup[];
  onClose: () => void;
  onConfirm: (modifiers: OrderItemModifier[], qty: number, note: string) => void;
  initial?: { modifiers: OrderItemModifier[]; qty: number; note: string };
}) {
  const t = useT();
  const money = useMoney();

  const [picked, setPicked] = useState<Record<string, string[]>>(() => {
    const chosen = initial?.modifiers ?? [];
    const map: Record<string, string[]> = {};
    for (const group of groups) {
      const inGroup = group.options.filter((o) => chosen.some((c) => c.id === o.id)).map((o) => o.id);
      if (inGroup.length) map[group.id] = inGroup;
      else if (group.required && group.options.length) map[group.id] = [group.options[0].id];
    }
    return map;
  });
  const [qty, setQty] = useState(initial?.qty ?? 1);
  const [note, setNote] = useState(initial?.note ?? '');

  const selected: OrderItemModifier[] = useMemo(() => {
    const out: OrderItemModifier[] = [];
    for (const group of groups) {
      for (const id of picked[group.id] ?? []) {
        const option = group.options.find((o) => o.id === id);
        if (option) out.push({ id: option.id, name: option.name, priceDelta: option.priceDelta });
      }
    }
    return out;
  }, [groups, picked]);

  const toggle = (group: ModifierGroup, option: ModifierOption) => {
    setPicked((prev) => {
      const current = prev[group.id] ?? [];
      if (group.multiple) {
        const next = current.includes(option.id)
          ? current.filter((id) => id !== option.id)
          : [...current, option.id];
        return { ...prev, [group.id]: next };
      }
      if (current.includes(option.id) && !group.required) return { ...prev, [group.id]: [] };
      return { ...prev, [group.id]: [option.id] };
    });
  };

  const missing = groups.filter((g) => g.required && !(picked[g.id]?.length));
  const unit = unitPriceOf({ price: product.price, modifiers: selected });

  return (
    <Modal
      open
      onClose={onClose}
      title={product.name}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={missing.length > 0 || qty <= 0}
            onClick={() => onConfirm(selected, qty, note.trim())}
          >
            {t('common.add')} · {money(Math.round(unit * qty))}
          </Button>
        </>
      }
    >
      <div className="col gap-16">
        {groups.map((group) => (
          <div key={group.id}>
            <div className="row between mb-8">
              <span className="label">{group.name}</span>
              {group.required && <span className="badge badge-warn">{t('common.required')}</span>}
            </div>
            <div className="row wrap gap-8">
              {group.options.map((option) => {
                const active = (picked[group.id] ?? []).includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`chip ${active ? 'active' : ''}`}
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
                );
              })}
            </div>
          </div>
        ))}

        <div className="row gap-12">
          <Field label={t('common.quantity')}>
            <div className="qty-stepper">
              <button type="button" onClick={() => setQty((q) => Math.max(0.001, q - 1))}>
                −
              </button>
              <input
                value={qty}
                inputMode="decimal"
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/[^\d.]/g, ''));
                  if (Number.isFinite(n)) setQty(n);
                }}
              />
              <button type="button" onClick={() => setQty((q) => q + 1)}>
                +
              </button>
            </div>
          </Field>
          <Field label={t('pos.itemNote')}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
