import { useState } from 'react';
import { Button } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { AuthShell } from '@/components/AuthShell';
import { Logo } from '@/components/Logo';
import { useApp, useT } from '@/store/app';
import type { TranslationKey } from '@/i18n';
import type { User } from '@/db/types';

export function LoginPage() {
  const t = useT();
  const users = useApp((s) => s.users);
  const setUser = useApp((s) => s.setUser);
  const shopName = useApp((s) => s.settings.shopName);

  const [picked, setPicked] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const choose = (user: User) => {
    if (!user.pin) {
      void setUser(user);
      return;
    }
    setPicked(user);
    setPin('');
    setError('');
  };

  const submit = (value: string) => {
    if (!picked) return;
    if (value === picked.pin) void setUser(picked);
    else {
      setError(t('auth.wrongPin'));
      setPin('');
    }
  };

  const press = (digit: string) => {
    const next = (pin + digit).slice(0, 6);
    setPin(next);
    setError('');
    if (picked && next.length === picked.pin.length) submit(next);
  };

  return (
    <AuthShell>
      <div className="onboard-card" style={{ maxWidth: 420 }}>
        <div className="center mb-16">
          <div style={{ display: 'grid', placeItems: 'center', marginBottom: 12 }}>
            <Logo size={52} />
          </div>
          <h2>{shopName}</h2>
          <div className="muted small mt-4">{picked ? t('auth.enterPin') : t('auth.selectUser')}</div>
        </div>

        {!picked ? (
          <div className="col gap-8">
            {users.map((user) => (
              <button key={user.id} type="button" className="choice" onClick={() => choose(user)}>
                <div className="avatar" style={{ background: user.color }}>
                  {user.name.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className="choice-title">{user.name}</div>
                  <div className="choice-desc">
                    {t(`user.role${user.role.charAt(0).toUpperCase()}${user.role.slice(1)}` as TranslationKey)}
                  </div>
                </div>
                {user.pin ? <Icon name="lock" size={15} className="dim auth-user" /> : null}
              </button>
            ))}
          </div>
        ) : (
          <div className="col gap-16">
            <div className="pin-dots">
              {Array.from({ length: Math.max(4, picked.pin.length) }).map((_, i) => (
                <span key={i} className={`pin-dot ${i < pin.length ? 'on' : ''}`} />
              ))}
            </div>
            {error && <div className="error-text center">{error}</div>}
            <div className="keypad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button key={d} type="button" onClick={() => press(d)}>
                  {d}
                </button>
              ))}
              <button type="button" onClick={() => setPin('')}>
                C
              </button>
              <button type="button" onClick={() => press('0')}>
                0
              </button>
              <button type="button" onClick={() => setPin(pin.slice(0, -1))}>
                ←
              </button>
            </div>
            <Button block onClick={() => setPicked(null)} icon="chevronLeft">
              {t('common.back')}
            </Button>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
