import { formatDateTime } from '@/core/date';
import { formatAmount } from '@/core/money';
import { useApp, useT } from '@/store/app';
import type { ShiftTotals } from '@/services/shifts';
import type { Shift } from '@/db/types';
import type { TranslationKey } from '@/i18n';

const METHOD_KEY: Record<string, TranslationKey> = {
  cash: 'pay.cash',
  card: 'pay.card',
  transfer: 'pay.transfer',
  ewallet: 'pay.ewallet',
  qr: 'pay.qr',
  debt: 'pay.debt',
  points: 'pay.points',
};

export function ShiftReceipt({
  shift,
  totals,
  preview = false,
}: {
  shift: Shift;
  totals: ShiftTotals;
  preview?: boolean;
}) {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const m = (v: number) => formatAmount(v, settings.currency, settings.lang);
  const counted = shift.status === 'closed' ? shift.countedCash : totals.expectedCash;
  const diff = shift.status === 'closed' ? shift.difference : 0;

  const row = (label: string, value: string, strong = false) => (
    <div className="rc-total-row" style={strong ? { fontWeight: 700 } : undefined}>
      <span>{label}</span>
      <span className="rc-num">{value}</span>
    </div>
  );

  return (
    <div
      className={`receipt ${settings.receiptWidth === 58 ? 'receipt-58' : ''} ${preview ? 'receipt-preview' : ''}`}
    >
      <div className="rc-shop">
        <div className="rc-shop-name">{settings.shopName}</div>
      </div>
      <div className="rc-title">{t('rc.shiftReport')}</div>
      <div className="rc-sep" />

      <div className="rc-meta">
        <span>{t('common.code')}: {shift.code}</span>
        <span>{t('common.employee')}: {shift.userName}</span>
      </div>
      <div className="rc-meta">
        <span>{t('common.from')}: {formatDateTime(shift.openedAt, settings.lang)}</span>
      </div>
      <div className="rc-meta">
        <span>
          {t('common.to')}:{' '}
          {shift.closedAt ? formatDateTime(shift.closedAt, settings.lang) : '—'}
        </span>
      </div>

      <div className="rc-sep" />
      {row(t('rep.orderCount'), String(totals.orderCount))}
      {row(t('rep.revenue'), m(totals.totalSales), true)}
      {row(t('rep.discounts'), m(totals.discountTotal))}
      {row(t('rep.refunds'), m(totals.refundTotal))}

      <div className="rc-sep" />
      {Object.entries(totals.byMethod).map(([method, amount]) =>
        row(t(METHOD_KEY[method] ?? 'common.other'), m(amount)),
      )}

      <div className="rc-sep" />
      {row(t('shift.openingCash'), m(shift.openingCash))}
      {row(t('shift.cashSales'), m(totals.cashSales))}
      {row(t('shift.cashIn'), m(totals.cashIn))}
      {row(t('shift.cashOut'), `-${m(totals.cashOut)}`)}
      {totals.expenseCash > 0 && row(t('exp.title'), `-${m(totals.expenseCash)}`)}
      {totals.cashRefunds > 0 && row(t('rep.refunds'), `-${m(totals.cashRefunds)}`)}

      <div className="rc-sep-solid" />
      {row(t('shift.expectedCash'), m(totals.expectedCash), true)}
      {row(t('shift.countedCash'), m(counted), true)}
      {shift.status === 'closed' &&
        row(t('shift.difference'), `${diff > 0 ? '+' : ''}${m(diff)}`, true)}

      {shift.note && <div className="rc-foot">{shift.note}</div>}
      <div className="rc-foot">
        {'_'.repeat(settings.receiptWidth === 58 ? 22 : 30)}
        {'\n'}
        {shift.userName}
      </div>
    </div>
  );
}
