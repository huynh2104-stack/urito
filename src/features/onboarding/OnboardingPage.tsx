import { useState } from 'react';
import { Button, Checkbox, Field, Input } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { AuthShell } from '@/components/AuthShell';
import { Logo } from '@/components/Logo';
import { LANGUAGES } from '@/i18n';
import { CURRENCIES } from '@/core/money';
import { seedWorkspace } from '@/db/seed';
import { useApp, useT } from '@/store/app';
import { toast } from '@/store/ui';
import type { BusinessType, CurrencyCode, Lang } from '@/db/types';

const TYPES: { key: BusinessType; icon: string }[] = [
  { key: 'retail', icon: 'store' },
  { key: 'cafe', icon: 'coffee' },
  { key: 'restaurant', icon: 'table' },
];

export function OnboardingPage() {
  const t = useT();
  const updateSettings = useApp((s) => s.updateSettings);
  const reloadSettings = useApp((s) => s.reloadSettings);
  const reloadUsers = useApp((s) => s.reloadUsers);
  const init = useApp((s) => s.init);
  const lang = useApp((s) => s.settings.lang);

  const [step, setStep] = useState(0);
  const [currency, setCurrency] = useState<CurrencyCode>('VND');
  const [businessType, setBusinessType] = useState<BusinessType>('retail');
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [withSample, setWithSample] = useState(true);
  const [withHistory, setWithHistory] = useState(true);
  const [busy, setBusy] = useState(false);

  const setLang = (next: Lang) => {
    void updateSettings({ lang: next, currency: next === 'ja' ? 'JPY' : currency });
    if (next === 'ja') setCurrency('JPY');
  };

  const finish = async () => {
    if (!shopName.trim()) return;
    setBusy(true);
    try {
      await seedWorkspace({
        businessType,
        lang,
        currency,
        shopName: shopName.trim(),
        ownerName: ownerName.trim() || shopName.trim(),
        withSampleData: withSample,
        withSampleHistory: withSample && withHistory,
      });
      await reloadSettings();
      await reloadUsers();
      await init();
    } catch (err) {
      console.error(err);
      toast.error(t('common.error'));
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="onboard-card">
        <div className="row gap-12 mb-16" style={{ alignItems: 'flex-start' }}>
          <Logo size={44} />
          <div>
            <h1>{t('onboarding.welcome')}</h1>
            <div className="muted small mt-4">{t('onboarding.subtitle')}</div>
          </div>
        </div>

        <div className="auth-steps" aria-label={t('onboarding.step', { n: step + 1, total: 2 })}>
          {[0, 1].map((i) => (
            <span key={i} className={i <= step ? 'on' : ''} />
          ))}
        </div>

        {step === 0 ? (
          <div className="col gap-16">
            <Field label={t('onboarding.language')}>
              <div className="btn-group">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    className={`btn ${lang === l.code ? 'active' : ''}`}
                    onClick={() => setLang(l.code)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label={t('onboarding.currency')}>
              <div className="btn-group">
                {(Object.keys(CURRENCIES) as CurrencyCode[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`btn ${currency === c ? 'active' : ''}`}
                    onClick={() => setCurrency(c)}
                  >
                    {CURRENCIES[c].symbol} {c}
                  </button>
                ))}
              </div>
            </Field>

            <Field label={t('onboarding.businessType')}>
              <div className="col gap-8">
                {TYPES.map((type) => (
                  <button
                    key={type.key}
                    type="button"
                    className={`choice ${businessType === type.key ? 'active' : ''}`}
                    onClick={() => setBusinessType(type.key)}
                  >
                    <Icon name={type.icon} size={20} />
                    <div>
                      <div className="choice-title">{t(`onboarding.${type.key}`)}</div>
                      <div className="choice-desc">{t(`onboarding.${type.key}Desc`)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </Field>

            <Button variant="primary" size="lg" block onClick={() => setStep(1)}>
              {t('common.next')}
            </Button>
          </div>
        ) : (
          <div className="col gap-16">
            <Field label={t('onboarding.shopName')} required>
              <Input
                initialFocus
                value={shopName}
                placeholder={t('onboarding.shopNamePlaceholder')}
                onChange={(e) => setShopName(e.target.value)}
              />
            </Field>

            <Field label={t('onboarding.ownerName')}>
              <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
            </Field>

            <Checkbox
              checked={withSample}
              onChange={setWithSample}
              label={t('onboarding.sampleData')}
              hint={t('onboarding.sampleDataDesc')}
            />
            {withSample && (
              <Checkbox
                checked={withHistory}
                onChange={setWithHistory}
                label={t('onboarding.sampleHistory')}
                hint={t('onboarding.sampleHistoryDesc')}
              />
            )}

            <div className="callout">
              <div className="row gap-8">
                <Icon name="lock" size={16} />
                <span>{t('onboarding.privacy')}</span>
              </div>
            </div>

            <div className="row gap-8">
              <Button onClick={() => setStep(0)} icon="chevronLeft">
                {t('common.back')}
              </Button>
              <Button
                variant="primary"
                size="lg"
                className="grow"
                disabled={!shopName.trim() || busy}
                onClick={() => void finish()}
              >
                {t('onboarding.start')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
