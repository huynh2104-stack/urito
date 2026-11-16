import { useState } from 'react';
import { Button, Field, Input, Modal, MoneyInput, NumberInput } from '@/components/ui';
import { db } from '@/db/db';
import { useLiveQuery } from '@/lib/useLiveQuery';
import { useMoney, useT } from '@/store/app';
import { useCart, useCartTotals } from '@/store/cart';
import { toast } from '@/store/ui';
import { percentOf } from '@/core/money';
import type { DiscountType } from '@/db/types';

export function DiscountModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const money = useMoney();
  const cart = useCart();
  const totals = useCartTotals();

  const [type, setType] = useState<DiscountType>(cart.discountType);
  const [value, setValue] = useState(cart.discountValue);
  const [code, setCode] = useState('');
  const promotions = useLiveQuery(async () => db.promotions.filter((p) => p.active).toArray(), [], []);

  const preview =
    type === 'percent' ? percentOf(totals.subtotal, value) : type === 'amount' ? Math.min(value, totals.subtotal) : 0;

  const applyCode = () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    const promo = promotions.find((p) => p.code.toUpperCase() === trimmed);
    if (!promo) {
      toast.error(t('promo.invalid'));
      return;
    }
    const now = Date.now();
    if ((promo.startAt && now < promo.startAt) || (promo.endAt && now > promo.endAt)) {
      toast.error(t('promo.expired'));
      return;
    }
    if (promo.minTotal && totals.subtotal < promo.minTotal) {
      toast.error(t('promo.minNotMet', { amount: money(promo.minTotal) }));
      return;
    }
    useCart.getState().setDiscount(promo.type, promo.value, promo.name);
    void db.promotions.update(promo.id, { usageCount: promo.usageCount + 1 });
    toast.success(t('promo.applied', { name: promo.name }));
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('pos.orderDiscount')}
      footer={
        <>
          <Button
            onClick={() => {
              useCart.getState().setDiscount('none', 0);
              onClose();
            }}
          >
            {t('common.reset')}
          </Button>
          <span className="grow" />
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            onClick={() => {
              useCart.getState().setDiscount(type, type === 'none' ? 0 : value);
              onClose();
            }}
          >
            {t('common.apply')}
          </Button>
        </>
      }
    >
      <div className="col gap-16">
        <Field label={t('common.type')}>
          <div className="btn-group w-full">
            <button
              type="button"
              className={`btn grow ${type === 'none' ? 'active' : ''}`}
              onClick={() => setType('none')}
            >
              {t('common.none')}
            </button>
            <button
              type="button"
              className={`btn grow ${type === 'percent' ? 'active' : ''}`}
              onClick={() => setType('percent')}
            >
              {t('common.percent')} %
            </button>
            <button
              type="button"
              className={`btn grow ${type === 'amount' ? 'active' : ''}`}
              onClick={() => setType('amount')}
            >
              {t('common.money')}
            </button>
          </div>
        </Field>

        {type === 'percent' && (
          <Field label="%">
            <NumberInput value={value} onChange={setValue} min={0} max={100} initialFocus />
            <div className="row gap-4 mt-8">
              {[5, 10, 15, 20, 30, 50].map((p) => (
                <Button key={p} size="sm" onClick={() => setValue(p)}>
                  {p}%
                </Button>
              ))}
            </div>
          </Field>
        )}

        {type === 'amount' && (
          <Field label={t('common.amount')}>
            <MoneyInput value={value} onChange={setValue} initialFocus />
          </Field>
        )}

        {type !== 'none' && (
          <div className="callout">
            {t('common.subtotal')}: <strong>{money(totals.subtotal)}</strong> → {t('common.total')}:{' '}
            <strong>{money(Math.max(0, totals.subtotal - preview))}</strong>
          </div>
        )}

        {promotions.length > 0 && (
          <Field label={t('promo.apply')}>
            <div className="row gap-8">
              <Input
                value={code}
                placeholder={t('promo.code')}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyCode();
                }}
              />
              <Button onClick={applyCode}>{t('common.apply')}</Button>
            </div>
          </Field>
        )}
      </div>
    </Modal>
  );
}
