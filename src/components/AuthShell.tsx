import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { Logo } from './Logo';
import { useT } from '@/store/app';
import { APP_VERSION } from '@/version';
import type { TranslationKey } from '@/i18n';

const FEATURES: { icon: IconName; title: TranslationKey; desc: TranslationKey }[] = [
  { icon: 'cloud', title: 'brand.f1', desc: 'brand.f1d' },
  { icon: 'zap', title: 'brand.f2', desc: 'brand.f2d' },
  { icon: 'lock', title: 'brand.f3', desc: 'brand.f3d' },
];

/** 初回セットアップ画面とログイン画面で共有する2分割レイアウト枠。 */
export function AuthShell({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <div className="auth">
      <aside className="auth-brand">
        <div className="auth-wordmark">
          <Logo size={40} />
          Urito
        </div>

        <div>
          <h2 className="auth-headline">{t('brand.tagline')}</h2>
          <p className="auth-tagline-mobile">{t('brand.tagline')}</p>
          <div className="auth-features">
            {FEATURES.map((f) => (
              <div key={f.title} className="auth-feature">
                <span className="auth-feature-icon">
                  <Icon name={f.icon} size={18} />
                </span>
                <div>
                  <div className="auth-feature-title">{t(f.title)}</div>
                  <div className="auth-feature-desc">{t(f.desc)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="auth-foot">Urito POS · v{APP_VERSION}</div>
      </aside>

      <main className="auth-main">{children}</main>
    </div>
  );
}
