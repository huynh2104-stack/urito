import { formatDateTime } from '@/core/date';
import { formatAmount, formatQty } from '@/core/money';
import { effectiveTaxRateBp, orderTaxLinesForDisplay } from '@/core/tax';
import { db } from '@/db/db';
import { useApp } from '@/store/app';
import type { Lang, Order, PayMethod } from '@/db/types';
import { ensureLangDict, makeT, type TranslationKey } from '@/i18n';

const METHOD_KEY: Record<PayMethod, TranslationKey> = {
  cash: 'pay.cash',
  card: 'pay.card',
  transfer: 'pay.transfer',
  ewallet: 'pay.ewallet',
  qr: 'pay.qr',
  debt: 'pay.debt',
  points: 'pay.points',
};

/** 伝票コードから端末レジ番号を抽出する（接頭辞に依存しない）。 */
export function extractDeviceNo(code: string, prefix: string): string {
  if (!code) return '';
  const body = prefix && code.startsWith(prefix) ? code.slice(prefix.length) : code.replace(/^[A-Za-z]+/, '');
  const m = body.match(/^([A-Za-z0-9]{1,4})-\d{6}-/);
  return m ? m[1] : '';
}

/** 明細行が軽減税率対象（※マーク表示対象）であるか判定する。 */
export function isReducedTaxItem(
  item: Order['items'][number],
  orderType: Order['type'],
  taxMode: Order['taxMode'],
  settings: Parameters<typeof effectiveTaxRateBp>[2],
): boolean {
  const standardRateBp = settings.taxRates?.standard ?? 1000;
  const reducedRateBp = settings.taxRates?.reduced ?? 800;
  if (taxMode === 'none' || reducedRateBp <= 0 || reducedRateBp >= standardRateBp) return false;
  const rateBp = item.taxRateBp ?? effectiveTaxRateBp(item.taxCategory, orderType, settings);
  return rateBp > 0 && rateBp === reducedRateBp;
}

/** サーマルレシートおよび日本向け適格簡易請求書（軽減税率 ※・税率別内訳・登録番号対応）。 */
/** F-02: レシート印字言語に合わせて辞書を先読みし、商品の多言語登録名を適用した伝票を返す。 */
export async function localizeOrderForPrint(order: Order, targetLang: Lang): Promise<Order> {
  await ensureLangDict(targetLang);
  const ids = [...new Set(order.items.map((i) => i.productId).filter(Boolean))];
  if (!ids.length) return order;
  const prods = await db.products.bulkGet(ids);
  const nameMap = new Map<string, string>();
  prods.forEach((p) => {
    const loc = p?.i18n?.[targetLang]?.name?.trim();
    if (p && loc) nameMap.set(p.id, loc);
  });
  if (!nameMap.size) return order;
  return {
    ...order,
    items: order.items.map((i) => ({ ...i, name: nameMap.get(i.productId) ?? i.name })),
  };
}

export function Receipt({
  order,
  provisional = false,
  preview = false,
  langOverride,
}: {
  order: Order;
  provisional?: boolean;
  preview?: boolean;
  langOverride?: Lang;
}) {
  const settings = useApp((s) => s.settings);
  const lang = langOverride ?? settings.lang;
  const t = makeT(lang);
  const m = (v: number) => formatAmount(v, settings.currency, lang);

  const hasTransfer = order.payments.some((p) => p.method === 'transfer' || p.method === 'qr');
  const deviceNo = extractDeviceNo(order.code, settings.orderPrefix);

  const isReducedItem = (item: Order['items'][number]) =>
    isReducedTaxItem(item, order.type, order.taxMode, settings);

  const hasReduced = order.items.some(isReducedItem);
  const taxLines = order.taxMode !== 'none' ? orderTaxLinesForDisplay(order) : [];

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
        <span>
          {deviceNo ? `${t('rc.deviceNo')}: ${deviceNo}` : ''}
          {deviceNo && order.tableName ? ' · ' : ''}
          {order.tableName ? `${t('rc.table')}: ${order.tableName}` : ''}
        </span>
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
          {order.items.map((item) => {
            const reduced = isReducedItem(item);
            return (
              <tr key={item.id}>
                <td colSpan={4} style={{ paddingBottom: 3 }}>
                  <div className="rc-item-name">
                    {item.name}
                    {reduced ? ' ※' : ''}
                  </div>
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
            );
          })}
        </tbody>
      </table>

      {hasReduced && (
        <div className="rc-line" style={{ marginTop: 2 }}>
          {t('rc.reducedNote')}
        </div>
      )}

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
      {taxLines.map((line) => (
        <div className="rc-total-row" key={line.rateBp}>
          <span>{t('rc.taxTarget', { rate: line.rateBp / 100 })}</span>
          <span className="rc-num">
            {order.taxMode === 'inclusive'
              ? `${m(line.gross)}${t('rc.taxIncludedNote', { tax: m(line.tax) })}`
              : `${m(line.net)}${t('rc.taxExcludedNote', { tax: m(line.tax) })}`}
          </span>
        </div>
      ))}
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
      {order.paidAmount > 0 && (order.changeAmount > 0 || order.payments.length > 1) && (
        <div className="rc-total-row">
          <span>{t('pay.received')}</span>
          <span className="rc-num">{m(order.paidAmount)}</span>
        </div>
      )}
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
