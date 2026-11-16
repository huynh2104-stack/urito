import { useState } from 'react';
import { Button, Field, Input, Modal } from '@/components/ui';
import { formatDate } from '@/core/date';
import { formatAmount } from '@/core/money';
import { orderTaxLinesForDisplay } from '@/core/tax';
import { useApp, useT } from '@/store/app';
import { printDocument } from './PrintHost';
import type { Order } from '@/db/types';

/** 日本商慣行に沿った正式な領収書コンポーネント（宛名・但し書き・税率別内訳・収入印紙欄）。 */
export function Ryoshusho({
  order,
  addressee,
  subject,
  preview = false,
}: {
  order: Order;
  addressee: string;
  subject: string;
  preview?: boolean;
}) {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const lang = settings.lang;
  const m = (v: number) => formatAmount(v, settings.currency, lang);
  const taxLines = order.taxMode !== 'none' ? orderTaxLinesForDisplay(order) : [];
  const netBeforeTax = taxLines.length
    ? taxLines.reduce((s, l) => s + l.net, 0)
    : order.total - order.tax;
  const needsRevenueStamp = settings.currency === 'JPY' && netBeforeTax >= 50_000;

  return (
    <div className={`ryoshusho ${preview ? 'receipt-preview' : ''}`}>
      <div className="ryoshu-head">
        <div className="ryoshu-title">{t('ryoshu.title')}</div>
        <div className="ryoshu-meta">
          <div>No. {order.code || '—'}</div>
          <div>
            {t('ryoshu.issueDate')}: {formatDate(order.paidAt || order.createdAt, lang)}
          </div>
        </div>
      </div>

      <div className="ryoshu-addressee">
        <span>{addressee || t('ryoshu.defaultAddressee')}</span>
        {t('ryoshu.honorific') && <span className="ryoshu-honorific">{t('ryoshu.honorific')}</span>}
      </div>

      <div className="ryoshu-amount-box">
        <span className="ryoshu-amount-label">{t('common.amount')}</span>
        <span className="ryoshu-amount-val">
          {m(order.total)}
          {lang === 'ja' ? '-' : ''}
        </span>
      </div>

      <div className="ryoshu-subject">
        <div>
          {t('ryoshu.subject')}: {subject || t('ryoshu.defaultSubject')}
        </div>
        <div className="ryoshu-confirmed">{t('ryoshu.confirmed')}</div>
      </div>

      <div className="ryoshu-bottom">
        <div className="ryoshu-breakdown">
          {taxLines.map((line) => (
            <div className="ryoshu-tax-row" key={line.rateBp}>
              <span>{t('rc.taxTarget', { rate: line.rateBp / 100 })}</span>
              <span>
                {order.taxMode === 'inclusive'
                  ? `${m(line.gross)}${t('rc.taxIncludedNote', { tax: m(line.tax) })}`
                  : `${m(line.net)}${t('rc.taxExcludedNote', { tax: m(line.tax) })}`}
              </span>
            </div>
          ))}
        </div>

        {needsRevenueStamp && <div className="ryoshu-stamp">{t('ryoshu.stampBox')}</div>}
      </div>

      <div className="ryoshu-issuer">
        <div className="ryoshu-issuer-name">{settings.shopName}</div>
        {settings.shopAddress && <div>{settings.shopAddress}</div>}
        {settings.shopPhone && (
          <div>
            {t('common.phone')}: {settings.shopPhone}
          </div>
        )}
        {settings.taxCode && (
          <div>
            {t('set.taxCode')}: {settings.taxCode}
          </div>
        )}
      </div>
    </div>
  );
}

/** 領収書の宛名と但し書きを編集して印刷するモーダル。 */
export function RyoshushoModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const t = useT();
  const [addressee, setAddressee] = useState(() => order.customerName || t('ryoshu.defaultAddressee'));
  const [subject, setSubject] = useState(() => t('ryoshu.defaultSubject'));

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('orders.ryoshusho')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.close')}</Button>
          <span className="grow" />
          <Button
            variant="primary"
            icon="print"
            onClick={() => printDocument(<Ryoshusho order={order} addressee={addressee} subject={subject} />)}
          >
            {t('common.print')}
          </Button>
        </>
      }
    >
      <div className="col gap-12">
        <Field label={t('ryoshu.addressee')}>
          <Input value={addressee} onChange={(e) => setAddressee(e.target.value)} initialFocus />
        </Field>
        <Field label={t('ryoshu.subject')}>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Ryoshusho order={order} addressee={addressee} subject={subject} preview />
      </div>
    </Modal>
  );
}
