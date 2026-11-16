import { useMemo } from 'react';
import { Button } from '@/components/ui';
import { CartLine } from './CartLine';
import { useReserved } from '@/lib/useReserved';
import { useNow } from '@/lib/useNow';
import { Icon } from '@/components/Icon';
import { formatQty } from '@/core/money';
import { formatTime } from '@/core/date';
import { useApp, useMoney, useT } from '@/store/app';
import { useCart } from '@/store/cart';
import type { Totals } from '@/core/cart';
import type { OrderType, Product } from '@/db/types';
import type { TranslationKey } from '@/i18n';

const TYPE_LABEL: Record<OrderType, TranslationKey> = {
  retail: 'pos.retail',
  dine_in: 'pos.dineIn',
  takeaway: 'pos.takeaway',
  delivery: 'pos.delivery',
};

export function CartPanel({
  open,
  onClose,
  totals,
  onEditLine,
  onPay,
  onHold,
  onClear,
  onPickCustomer,
  onDiscount,
  onPickTable,
  products,
}: {
  open: boolean;
  onClose: () => void;
  totals: Totals;
  onEditLine: (lineId: string) => void;
  onPay: () => void;
  onHold: () => void;
  onClear: () => void;
  onPickCustomer: () => void;
  onDiscount: () => void;
  onPickTable: () => void;
  products: Product[];
}) {
  const t = useT();
  const money = useMoney();
  const settings = useApp((s) => s.settings);
  const cart = useCart();
  const lang = settings.lang;
  const isFood = settings.businessType !== 'retail';

  const reserved = useReserved();
  const now = useNow();
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const types: OrderType[] = isFood ? ['dine_in', 'takeaway', 'delivery'] : ['retail', 'delivery'];

  return (
    <aside className={`pos-right ${open ? 'open' : ''}`}>
      <div className="slip">
      <div className="cart-head">
        <div className="row between">
          <div className="slip-title grow">
            <strong>
              {cart.tableName ? `${t('pos.table')} ${cart.tableName}` : t('pos.cart')}
            </strong>
            <span className="slip-meta">
              {cart.orderId && !cart.orderCode ? `${t('orders.statusOpen')}, ` : ''}
              {formatTime(cart.createdAt || now, lang)}
            </span>
          </div>
          <div className="row gap-4">
            <Button variant="ghost" size="sm" icon="trash" onClick={onClear} title={t('pos.clearCart')} />
            <Button
              variant="ghost"
              size="sm"
              icon="x"
              className="mobile-only"
              onClick={onClose}
              title={t('common.close')}
            />
          </div>
        </div>

        <div className="btn-group" style={{ width: '100%' }}>
          {types.map((type) => (
            <button
              key={type}
              type="button"
              className={`btn btn-sm grow ${cart.type === type ? 'active' : ''}`}
              onClick={() => useCart.getState().setType(type)}
            >
              {t(TYPE_LABEL[type])}
            </button>
          ))}
        </div>

        <div className="row gap-4">
          {isFood && (
            <Button size="sm" icon="table" className="grow" onClick={onPickTable}>
              <span className="truncate">{cart.tableName || t('pos.selectTable')}</span>
            </Button>
          )}
          <Button size="sm" icon="user" className="grow" onClick={onPickCustomer}>
            <span className="truncate">{cart.customerName || t('pos.walkIn')}</span>
          </Button>
        </div>
      </div>

      <div className="cart-lines">
        {cart.items.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <Icon name="cart" size={32} strokeWidth={1.4} />
            </div>
            <div className="empty-title">{t('pos.emptyCart')}</div>
            <div className="small">{t('pos.emptyCartHint')}</div>
          </div>
        ) : (
          cart.items.map((item) => (
            <CartLine key={item.id} item={item} product={productById.get(item.productId)} held={reserved.get(item.productId) ?? 0} onEdit={onEditLine} />
          ))
        )}
      </div>

      <div className="cart-foot">
        <div className="total-row">
          <span>{t('common.subtotal')} ({formatQty(totals.unitCount, lang)})</span>
          <span className="num">{money(totals.subtotal)}</span>
        </div>

        <button
          type="button"
          className="total-row"
          style={{ width: '100%', background: 'none', border: 0, padding: '2px 0', cursor: 'pointer' }}
          onClick={onDiscount}
        >
          <span className="row gap-4">
            <Icon name="tag" size={13} />
            {t('common.discount')}
            {cart.promotionName ? <span className="badge badge-brand">{cart.promotionName}</span> : null}
          </span>
          <span className="num">{totals.discount > 0 ? `-${money(totals.discount)}` : '—'}</span>
        </button>

        {totals.serviceCharge > 0 && (
          <div className="total-row">
            <span>{t('common.serviceCharge')} {settings.serviceChargeRate}%</span>
            <span className="num">{money(totals.serviceCharge)}</span>
          </div>
        )}
        {settings.taxMode !== 'none' && totals.tax > 0 && (
          <div className="total-row">
            <span>
              {t('common.tax')} {settings.taxRate}%{settings.taxMode === 'inclusive' ? ' *' : ''}
            </span>
            <span className="num">{money(totals.tax)}</span>
          </div>
        )}
        {totals.pointsRedeemed > 0 && (
          <div className="total-row">
            <span>{t('rc.pointsUsed')}</span>
            <span className="num">-{money(totals.pointsRedeemed)}</span>
          </div>
        )}
        {totals.rounding !== 0 && (
          <div className="total-row">
            <span>{t('common.rounding')}</span>
            <span className="num">{totals.rounding > 0 ? '+' : ''}{money(totals.rounding)}</span>
          </div>
        )}

        <div className="total-row grand">
          <span>{t('common.total')}</span>
          <span className="num grand-amount">{money(totals.total)}</span>
        </div>

        <div className="row gap-8 mt-12">
          <Button icon="clock" onClick={onHold} disabled={!cart.items.length}>
            {t('pos.hold')}
          </Button>
          <Button
            variant="primary"
            size="lg"
            className="checkout-btn"
            onClick={onPay}
            disabled={!cart.items.length}
          >
            <span>{t('pos.checkout')}</span>
            {cart.items.length > 0 && <span className="num">{money(totals.total)}</span>}
          </Button>
        </div>
      </div>
      </div>
    </aside>
  );
}
