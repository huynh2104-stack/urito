import { formatDateTime } from '@/core/date';
import { formatAmount, formatQty } from '@/core/money';
import { useApp, useT } from '@/store/app';
import type { Order, PayMethod } from '@/db/types';
import type { TranslationKey } from '@/i18n';

const METHOD_KEY: Record<PayMethod, TranslationKey> = {
  cash: 'pay.cash',
  card: 'pay.card',
  transfer: 'pay.transfer',
  ewallet: 'pay.ewallet',
  qr: 'pay.qr',
  debt: 'pay.debt',
  points: 'pay.points',
};

export function Receipt({
  order,
  provisional = false,
  preview = false,
}: {
  order: Order;
  provisional?: boolean;
  preview?: boolean;
}) {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const lang = settings.lang;
  const m = (v: number) => formatAmount(v, settings.currency, lang);

  const hasTransfer = order.payments.some((p) => p.method === 'transfer' || p.method === 'qr');

  return (
    <div
      className={`receipt ${settings.receiptWidth === 58 ? 'receipt-58' : ''} ${preview ? 'receipt-preview' : ''}`}
    >
      <div className="rc-shop">
        {settings.receiptShowLogo && settings.logo ? (
          <img className="rc-logo" src={settings.logo} alt="" />
        ) : null}
        <div className="rc-shop-name">{settings.shopName}</div>
        {settings.shopAddress && <div className="rc-line">{settings.shopAddress}</div>}
        {settings.shopPhone && <div className="rc-line">{t('common.phone')}: {settings.shopPhone}</div>}
        {settings.taxCode && <div className="rc-line">{t('set.taxCode')}: {settings.taxCode}</div>}
      </div>

      <div className="rc-title">{provisional ? t('rc.provisional') : t('rc.invoice')}</div>

      {order.status === 'void' && <div className="rc-stamp">{t('rc.voided')}</div>}
      {order.status === 'refunded' && <div className="rc-stamp">{t('rc.refunded')}</div>}

      <div className="rc-sep" />

      <div className="rc-meta">
        <span>{t('rc.no')}: {order.code || '—'}</span>
        <span>{formatDateTime(order.paidAt || order.createdAt, lang)}</span>
      </div>
      <div className="rc-meta">
        <span>{t('rc.cashier')}: {order.userName || '—'}</span>
        {order.tableName ? <span>{t('rc.table')}: {order.tableName}</span> : <span />}
      </div>
      {order.customerName && (
        <div className="rc-meta">
          <span>{t('rc.customer')}: {order.customerName}</span>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>{t('rc.item')}</th>
            <th className="rc-num">{t('common.qty')}</th>
            <th className="rc-num">{t('common.price')}</th>
            <th className="rc-num">{t('common.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id}>
              <td colSpan={4} style={{ paddingBottom: 3 }}>
                <div className="rc-item-name">{item.name}</div>
                {item.modifiers.length > 0 && (
                  <div className="rc-item-sub">+ {item.modifiers.map((mo) => mo.name).join(', ')}</div>
                )}
                {item.note && <div className="rc-item-sub">* {item.note}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="rc-item-sub">
                    {formatQty(item.qty, lang)}
                    {item.unit ? ` ${item.unit}` : ''} × {m(item.gross / (item.qty || 1))}
                  </span>
                  <span className="rc-num">{m(item.total)}</span>
                </div>
                {item.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="rc-item-sub">{t('common.discount')}</span>
                    <span className="rc-num">-{m(item.discount)}</span>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rc-sep" />

      <div className="rc-total-row">
        <span>{t('common.subtotal')}</span>
        <span className="rc-num">{m(order.subtotal)}</span>
      </div>
      {order.discount > 0 && (
        <div className="rc-total-row">
          <span>{t('common.discount')}</span>
          <span className="rc-num">-{m(order.discount)}</span>
        </div>
      )}
      {order.serviceCharge > 0 && (
        <div className="rc-total-row">
          <span>{t('common.serviceCharge')}</span>
          <span className="rc-num">{m(order.serviceCharge)}</span>
        </div>
      )}
      {order.tax > 0 && (
        <div className="rc-total-row">
          <span>
            {t('common.tax')} {order.taxRate}%{order.taxMode === 'inclusive' ? ' *' : ''}
          </span>
          <span className="rc-num">{m(order.tax)}</span>
        </div>
      )}
      {order.pointsValue > 0 && (
        <div className="rc-total-row">
          <span>{t('rc.pointsUsed')} ({order.pointsUsed})</span>
          <span className="rc-num">-{m(order.pointsValue)}</span>
        </div>
      )}
      {order.rounding !== 0 && (
        <div className="rc-total-row">
          <span>{t('common.rounding')}</span>
          <span className="rc-num">{order.rounding > 0 ? '+' : ''}{m(order.rounding)}</span>
        </div>
      )}

      <div className="rc-sep-solid" />
      <div className="rc-total-row rc-grand">
        <span>{t('common.total')}</span>
        <span className="rc-num">{m(order.total)}</span>
      </div>
      <div className="rc-sep-solid" />

      {order.payments.map((p) => (
        <div className="rc-total-row" key={p.id}>
          <span>{t(METHOD_KEY[p.method])}</span>
          <span className="rc-num">{m(p.amount)}</span>
        </div>
      ))}
      {order.changeAmount > 0 && (
        <div className="rc-total-row">
          <span>{t('pay.change')}</span>
          <span className="rc-num">{m(order.changeAmount)}</span>
        </div>
      )}
      {order.dueAmount > 0 && (
        <div className="rc-total-row">
          <span>{t('pay.due')}</span>
          <span className="rc-num">{m(order.dueAmount)}</span>
        </div>
      )}
      {order.refundedAmount > 0 && (
        <div className="rc-total-row">
          <span>{t('rep.refunds')}</span>
          <span className="rc-num">-{m(order.refundedAmount)}</span>
        </div>
      )}

      {settings.loyaltyEnabled && order.pointsEarned > 0 && (
        <div className="rc-badge">{t('rc.points')}: +{order.pointsEarned}</div>
      )}

      {order.note && <div className="rc-badge">{order.note}</div>}

      {hasTransfer && settings.bankInfo && (
        <>
          <div className="rc-sep" />
          <div className="rc-line" style={{ whiteSpace: 'pre-wrap' }}>{settings.bankInfo}</div>
        </>
      )}

      <div className="rc-foot">{settings.receiptFooter || t('rc.thankYou')}</div>
    </div>
  );
}
