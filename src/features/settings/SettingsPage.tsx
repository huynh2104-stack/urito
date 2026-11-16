import { useEffect, useState } from 'react';
import {
  Button,
  Field,
  Input,
  Modal,
  MoneyInput,
  NumberInput,
  Select,
  SwitchRow,
  Tabs,
  Textarea,
} from '@/components/ui';
import { db, BACKUP_TABLES, type BackupTable } from '@/db/db';
import { getDeviceNo, peekSeq, setDeviceNo, setSeq } from '@/db/seq';
import { CURRENCIES } from '@/core/money';
import { LANGUAGES } from '@/i18n';
import { APP_VERSION } from '@/version';
import { useApp, useT } from '@/store/app';
import { toast } from '@/store/ui';
import { estimateStorage } from '@/services/backup';
import { Receipt } from '@/print/Receipt';
import { sampleOrder } from './sampleOrder';
import { shrinkImage } from '@/lib/image';
import type { BusinessType, CurrencyCode, Lang, Settings, TaxMode, TaxRounding } from '@/db/types';

type TabKey = 'shop' | 'pricing' | 'receipt' | 'system';

export function SettingsPage() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const init = useApp((s) => s.init);

  const [tab, setTab] = useState<TabKey>('shop');
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deviceNo, setDeviceNoState] = useState('');
  const [orderSeq, setOrderSeq] = useState(1);

  useEffect(() => {
    void estimateStorage().then(setStorage);
    void getDeviceNo().then(setDeviceNoState);
    void peekSeq('order').then((n) => setOrderSeq(n + 1));
  }, []);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => void updateSettings({ [key]: value });

  const uploadLogo = async (file: File) => {
    const dataUrl = await shrinkImage(file, 320, 'image/png');
    void updateSettings({ logo: dataUrl });
    toast.success(t('common.saved'));
  };

  const clearDemo = async () => {
    await db.transaction(
      'rw',
      [db.products, db.categories, db.modifierGroups, db.customers, db.orders, db.stockMovements, db.purchases, db.suppliers],
      async () => {
        await Promise.all([
          db.products.clear(),
          db.categories.clear(),
          db.modifierGroups.clear(),
          db.customers.clear(),
          db.orders.clear(),
          db.stockMovements.clear(),
          db.purchases.clear(),
          db.suppliers.clear(),
        ]);
      },
    );
    toast.success(t('common.deleted'));
  };

  const resetAll = async () => {
    for (const name of BACKUP_TABLES) {
      await (db as unknown as Record<BackupTable, { clear: () => Promise<void> }>)[name].clear();
    }
    await db.kv.clear();
    setResetOpen(false);
    toast.success(t('set.resetDone'));
    await init();
    window.location.reload();
  };

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <div className="page-title">{t('set.title')}</div>
          <div className="page-sub">
            {t('set.version')} {APP_VERSION}
          </div>
        </div>
      </div>

      <Tabs
        tabs={[
          { key: 'shop' as const, label: t('set.shopInfo') },
          { key: 'pricing' as const, label: t('set.pricing') },
          { key: 'receipt' as const, label: t('set.receipt') },
          { key: 'system' as const, label: t('nav.groupSystem') },
        ]}
        value={tab}
        onChange={setTab}
      />

      <div className="mt-16 col gap-16">
        {tab === 'shop' && (
          <div className="card card-body col gap-12">
            <Field label={t('set.shopName')} required>
              <Input value={settings.shopName} onChange={(e) => set('shopName', e.target.value)} />
            </Field>
            <div className="grid grid-2">
              <Field label={t('common.phone')}>
                <Input value={settings.shopPhone} onChange={(e) => set('shopPhone', e.target.value)} />
              </Field>
              <Field label={t('set.taxCode')}>
                <Input value={settings.taxCode} onChange={(e) => set('taxCode', e.target.value)} />
              </Field>
            </div>
            <Field label={t('common.address')}>
              <Input value={settings.shopAddress} onChange={(e) => set('shopAddress', e.target.value)} />
            </Field>
            <Field label={t('set.businessType')}>
              <Select
                value={settings.businessType}
                onChange={(e) => set('businessType', e.target.value as BusinessType)}
              >
                <option value="retail">{t('onboarding.retail')}</option>
                <option value="cafe">{t('onboarding.cafe')}</option>
                <option value="restaurant">{t('onboarding.restaurant')}</option>
              </Select>
            </Field>
            <Field label={t('set.logo')}>
              <div className="row gap-12">
                {settings.logo && (
                  <img
                    src={settings.logo}
                    alt=""
                    style={{ height: 56, borderRadius: 8, border: '1px solid var(--c-border)' }}
                  />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadLogo(file);
                  }}
                />
                {settings.logo && (
                  <Button variant="ghost" icon="trash" onClick={() => set('logo', '')}>
                    {t('set.removeLogo')}
                  </Button>
                )}
              </div>
            </Field>

            <div className="divider" />

            <div className="grid grid-2">
              <Field label={t('set.language')}>
                <Select value={settings.lang} onChange={(e) => set('lang', e.target.value as Lang)}>
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('set.theme')}>
                <Select
                  value={settings.theme}
                  onChange={(e) => set('theme', e.target.value as 'light' | 'dark')}
                >
                  <option value="light">{t('set.themeLight')}</option>
                  <option value="dark">{t('set.themeDark')}</option>
                </Select>
              </Field>
            </div>
          </div>
        )}

        {tab === 'pricing' && (
          <div className="card card-body col gap-12">
            <div className="grid grid-2">
              <Field label={t('set.currency')}>
                <Select
                  value={settings.currency}
                  onChange={(e) => {
                    const currency = e.target.value as CurrencyCode;
                    void updateSettings({ currency, roundTo: CURRENCIES[currency].defaultRoundTo });
                  }}
                >
                  {(Object.keys(CURRENCIES) as CurrencyCode[]).map((c) => (
                    <option key={c} value={c}>
                      {c} ({CURRENCIES[c].symbol})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('set.roundTo')} hint={t('set.roundOff')}>
                <MoneyInput value={settings.roundTo} onChange={(v) => set('roundTo', v)} />
              </Field>
            </div>

            <Field label={t('set.taxMode')}>
              <Select value={settings.taxMode} onChange={(e) => set('taxMode', e.target.value as TaxMode)}>
                <option value="none">{t('set.taxNone')}</option>
                <option value="inclusive">{t('set.taxInclusive')}</option>
                <option value="exclusive">{t('set.taxExclusive')}</option>
              </Select>
            </Field>

                        {settings.taxMode !== 'none' && (
              <>
                <div className="grid grid-3">
                  <Field label={t('tax.standardRate')}>
                    <NumberInput
                      value={(settings.taxRates?.standard ?? settings.taxRate * 100) / 100}
                      onChange={(v) => {
                        const bp = Math.max(0, Math.round(v * 100));
                        void updateSettings({
                          taxRate: v,
                          taxRates: { standard: bp, reduced: settings.taxRates?.reduced ?? 800 },
                        });
                      }}
                      min={0}
                      max={99}
                      step={0.1}
                    />
                  </Field>
                  <Field label={t('tax.reducedRate')}>
                    <NumberInput
                      value={(settings.taxRates?.reduced ?? 800) / 100}
                      onChange={(v) => {
                        const bp = Math.max(0, Math.round(v * 100));
                        void updateSettings({
                          taxRates: { standard: settings.taxRates?.standard ?? 1000, reduced: bp },
                        });
                      }}
                      min={0}
                      max={99}
                      step={0.1}
                    />
                  </Field>
                  <Field label={t('tax.rounding')}>
                    <Select
                      value={settings.taxRounding ?? 'floor'}
                      onChange={(e) => set('taxRounding', e.target.value as TaxRounding)}
                    >
                      <option value="floor">{t('tax.roundFloor')}</option>
                      <option value="round">{t('tax.roundRound')}</option>
                      <option value="ceil">{t('tax.roundCeil')}</option>
                    </Select>
                  </Field>
                </div>
                <SwitchRow
                  label={t('tax.eatInRule')}
                  hint={t('tax.eatInRuleHint')}
                  checked={!!settings.eatInRule}
                  onChange={(v) => set('eatInRule', v)}
                />
              </>
            )}

            <Field label={t('set.serviceCharge')}>
              <NumberInput
                value={settings.serviceChargeRate}
                onChange={(v) => set('serviceChargeRate', v)}
                min={0}
                max={50}
              />
            </Field>

            <div className="divider" />

            <SwitchRow
              label={t('set.loyaltyEnabled')}
              checked={settings.loyaltyEnabled}
              onChange={(v) => set('loyaltyEnabled', v)}
            />
            {settings.loyaltyEnabled && (
              <div className="grid grid-2">
                <Field label={t('set.loyaltyEarnPer')}>
                  <MoneyInput value={settings.loyaltyEarnPer} onChange={(v) => set('loyaltyEarnPer', v)} />
                </Field>
                <Field label={t('set.loyaltyPointValue')}>
                  <MoneyInput value={settings.loyaltyPointValue} onChange={(v) => set('loyaltyPointValue', v)} />
                </Field>
              </div>
            )}

            <div className="divider" />

            <SwitchRow
              label={t('set.negativeStock')}
              checked={settings.negativeStock}
              onChange={(v) => set('negativeStock', v)}
            />
          </div>
        )}

        {tab === 'receipt' && (
          <div className="grid grid-2" style={{ alignItems: 'start' }}>
            <div className="card card-body col gap-12">
              <Field label={t('set.receiptWidth')}>
                <Select
                  value={String(settings.receiptWidth)}
                  onChange={(e) => set('receiptWidth', Number(e.target.value) as 58 | 80)}
                >
                  <option value="58">58 mm</option>
                  <option value="80">80 mm</option>
                </Select>
              </Field>
              <Field label={t('set.receiptFooter')}>
                <Textarea
                  value={settings.receiptFooter}
                  placeholder={t('set.receiptFooterPlaceholder')}
                  onChange={(e) => set('receiptFooter', e.target.value)}
                />
              </Field>
              <Field label={t('set.bankInfo')}>
                <Textarea
                  value={settings.bankInfo}
                  placeholder={t('set.bankInfoPlaceholder')}
                  onChange={(e) => set('bankInfo', e.target.value)}
                />
              </Field>
              <SwitchRow
                label={t('set.receiptShowLogo')}
                checked={settings.receiptShowLogo}
                onChange={(v) => set('receiptShowLogo', v)}
              />
              <SwitchRow
                label={t('set.printAfterPay')}
                checked={settings.printAfterPay}
                onChange={(v) => set('printAfterPay', v)}
              />
              <div className="divider" />
              <div className="grid grid-3">
                <Field label={t('set.orderPrefix')}>
                  <Input value={settings.orderPrefix} onChange={(e) => set('orderPrefix', e.target.value)} />
                </Field>
                <Field label={t('set.deviceNo')}>
                  <Input
                    value={deviceNo}
                    maxLength={4}
                    onChange={(e) => setDeviceNoState(e.target.value.toUpperCase())}
                    onBlur={() => void setDeviceNo(deviceNo).then(setDeviceNoState)}
                  />
                </Field>
                <Field label={t('set.nextOrderNo')}>
                  <NumberInput
                    value={orderSeq}
                    onChange={(v) => {
                      const next = Math.max(1, v);
                      setOrderSeq(next);
                      void setSeq('order', next - 1);
                      set('nextOrderNo', next);
                    }}
                    min={1}
                  />
                </Field>
              </div>
              <Button icon="eye" onClick={() => setPreviewOpen(true)}>
                {t('set.previewReceipt')}
              </Button>
            </div>

            <div className="card card-body">
              <div className="card-title mb-12">{t('set.previewReceipt')}</div>
              <Receipt order={sampleOrder(settings)} preview />
            </div>
          </div>
        )}

        {tab === 'system' && (
          <>
            <div className="card card-body">
              <div className="card-title mb-12">{t('set.about')}</div>
              <div className="row between small">
                <span className="muted">{t('set.version')}</span>
                <span className="mono">{APP_VERSION}</span>
              </div>
              {storage && (
                <div className="row between small mt-4">
                  <span className="muted">{t('set.storageUsed')}</span>
                  <span className="num">
                    {(storage.usage / 1024 / 1024).toFixed(1)} MB
                    {storage.quota ? ` / ${(storage.quota / 1024 / 1024 / 1024).toFixed(1)} GB` : ''}
                  </span>
                </div>
              )}
              <div className="callout mt-12">{t('onboarding.privacy')}</div>
            </div>

            <div className="card card-body" style={{ borderColor: 'var(--c-danger)' }}>
              <div className="card-title text-danger mb-12">{t('set.danger')}</div>

              <div className="row between wrap gap-8" style={{ padding: '8px 0' }}>
                <div>
                  <div style={{ fontWeight: 550 }}>{t('set.clearDemo')}</div>
                  <div className="hint">{t('set.clearDemoDesc')}</div>
                </div>
                <Button onClick={() => void clearDemo()}>{t('common.delete')}</Button>
              </div>

              <div className="divider" />

              <div className="row between wrap gap-8" style={{ padding: '8px 0' }}>
                <div>
                  <div style={{ fontWeight: 550 }}>{t('set.resetAll')}</div>
                  <div className="hint">{t('set.resetAllDesc')}</div>
                </div>
                <Button variant="danger" onClick={() => setResetOpen(true)}>
                  {t('set.resetAll')}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} size="sm" title={t('set.previewReceipt')}>
        <Receipt order={sampleOrder(settings)} preview />
      </Modal>

      {resetOpen && <ResetModal onClose={() => setResetOpen(false)} onConfirm={() => void resetAll()} />}
    </div>
  );
}

function ResetModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  const t = useT();
  const keyword = t('set.resetKeyword');
  const [value, setValue] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('set.resetAll')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" disabled={value.trim().toUpperCase() !== keyword} onClick={onConfirm}>
            {t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="callout callout-danger mb-12">{t('set.resetAllDesc')}</div>
      <Field label={t('set.resetConfirm')}>
        <Input initialFocus value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
    </Modal>
  );
}
