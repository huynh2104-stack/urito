import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { AuthShell } from '@/components/AuthShell';
import { Logo } from '@/components/Logo';
import { db, kvDelete, kvGet, kvSet } from '@/db/db';
import { hasPin, nextLockout, verifyPin, type LockoutRecord } from '@/core/pin';
import { useNow } from '@/lib/useNow';
import { useApp, useT } from '@/store/app';
import type { TranslationKey } from '@/i18n';
import type { User } from '@/db/types';

const LOCK_KEY = (userId: string) => `auth.lockout.${userId}`;

export function LoginPage() {
  const t = useT();
  const users = useApp((s) => s.users);
  const setUser = useApp((s) => s.setUser);
  const shopName = useApp((s) => s.settings.shopName);
  const now = useNow(1000);

  const [picked, setPicked] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lockUntil, setLockUntil] = useState(0);

  const lockedSec = Math.max(0, Math.ceil((lockUntil - now) / 1000));

  const choose = async (user: User) => {
    const fresh = (await db.users.get(user.id)) ?? user;
    if (!hasPin(fresh)) {
      void setUser(fresh);
      return;
    }
    const lock = await kvGet<LockoutRecord>(LOCK_KEY(fresh.id));
    setPicked(fresh);
    setPin('');
    setError('');
    setLockUntil(lock?.until ?? 0);
  };

  const submit = useCallback(
    async (value: string) => {
      if (!picked || !value || busy) return;
      const curNow = Date.now();
      const lock = await kvGet<LockoutRecord>(LOCK_KEY(picked.id));
      if (lock && lock.until > curNow) {
        setLockUntil(lock.until);
        setPin('');
        return;
      }
      setBusy(true);
      try {
        const fresh = (await db.users.get(picked.id)) ?? picked;
        const ok = await verifyPin(value, fresh);
        if (ok) {
          await kvDelete(LOCK_KEY(fresh.id));
          await setUser(fresh);
        } else {
          const next = nextLockout(lock, Date.now());
          await kvSet(LOCK_KEY(fresh.id), next);
          setLockUntil(next.until);
          setError(next.until > Date.now() ? '' : t('auth.wrongPin'));
          setPin('');
        }
      } finally {
        setBusy(false);
      }
    },
    [picked, busy, setUser, t],
  );

  const press = useCallback(
    (digit: string) => {
      if (lockedSec > 0 || busy) return;
      setPin((cur) => (cur + digit).slice(0, 6));
      setError('');
    },
    [lockedSec, busy],
  );

  useEffect(() => {
    if (!picked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        press(e.key);
      } else if (e.key === 'Backspace') {
        setPin((cur) => cur.slice(0, -1));
      } else if (e.key === 'Enter' && pin.length > 0) {
        void submit(pin);
      } else if (e.key === 'Escape') {
        setPicked(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picked, pin, press, submit]);

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
              <button key={user.id} type="button" className="choice" onClick={() => void choose(user)}>
                <div className="avatar" style={{ background: user.color }}>
                  {user.name.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className="choice-title">{user.name}</div>
                  <div className="choice-desc">
                    {t(`user.role${user.role.charAt(0).toUpperCase()}${user.role.slice(1)}` as TranslationKey)}
                  </div>
                </div>
                {hasPin(user) ? <Icon name="lock" size={15} className="dim auth-user" /> : null}
              </button>
            ))}
          </div>
        ) : (
          <div className="col gap-16">
            {/* B-06: PIN 桁数の推測を防ぐため常に6ドットを表示し、明示的な確定操作で検証する */}
            <div className="pin-dots">
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} className={`pin-dot ${i < pin.length ? 'on' : ''}`} />
              ))}
            </div>
            {lockedSec > 0 ? (
              <div className="error-text center">{t('auth.lockedOut', { sec: lockedSec })}</div>
            ) : error ? (
              <div className="error-text center">{error}</div>
            ) : null}
            <div className="keypad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button key={d} type="button" disabled={lockedSec > 0 || busy} onClick={() => press(d)}>
                  {d}
                </button>
              ))}
              <button type="button" disabled={lockedSec > 0 || busy} onClick={() => setPin('')}>
                C
              </button>
              <button type="button" disabled={lockedSec > 0 || busy} onClick={() => press('0')}>
                0
              </button>
              <button type="button" disabled={lockedSec > 0 || busy} onClick={() => setPin(pin.slice(0, -1))}>
                ←
              </button>
            </div>
            <Button
              variant="primary"
              block
              disabled={!pin.length || lockedSec > 0 || busy}
              onClick={() => void submit(pin)}
            >
              {t('auth.unlock')}
            </Button>
            <Button block onClick={() => setPicked(null)} icon="chevronLeft">
              {t('common.back')}
            </Button>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
