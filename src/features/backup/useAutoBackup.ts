import { useEffect, useRef } from 'react';
import { isDbDirty, isDemoMode, withoutDirtyTracking } from '@/db/db';
import { APP_VERSION } from '@/version';
import { useApp } from '@/store/app';
import { toast } from '@/store/ui';
import { makeT } from '@/i18n';
import { formatTime } from '@/core/date';

let ordersSinceBackup = 0;

/** 会計完了ごとに呼び出し、「N件ごとの自動バックアップ」設定に応じて実行する。 */
export async function notifyOrderPaid(): Promise<void> {
  if (isDemoMode()) return;
  const { settings } = useApp.getState();
  const target = settings.backup.onOrderCount;
  if (!settings.backup.auto || target <= 0) return;
  ordersSinceBackup += 1;
  if (ordersSinceBackup < target) return;
  ordersSinceBackup = 0;
  await performBackup(true);
}

/** 複数タブ起動時でも1タブのみが自動バックアップを実行するよう Web Locks で排他制御する。 */
async function withBackupLock<T>(fn: () => Promise<T>): Promise<T | null> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('urito-autobackup', { ifAvailable: true }, async (lock) => {
      if (!lock) return null;
      return fn();
    });
  }
  return fn();
}

export async function performBackup(silent: boolean): Promise<boolean> {
  if (isDemoMode()) return false;
  const ran = await withBackupLock(async () => {
    const state = useApp.getState();
    const { settings } = state;
    const t = makeT(settings.lang);
    const { runBackup } = await import('@/services/backup');
    const result = await runBackup(APP_VERSION, settings.backup.keep);
    const now = Date.now();

    await withoutDirtyTracking(() =>
      state.updateSettings((cur) => ({
        backup: {
          ...cur.backup,
          lastAt: result.ok ? now : cur.backup.lastAt,
          lastError: result.ok ? '' : (result.error ?? ''),
        },
      })),
    );

    if (result.ok) {
      if (!silent) toast.success(t('bak.backupDone', { time: formatTime(now, settings.lang) }));
      return true;
    }
    if (result.error === 'permission') toast.warning(t('bak.permissionLost'));
    else if (result.error !== 'no-folder' && !silent) {
      toast.error(t('bak.backupFailed', { error: result.error ?? '' }));
    }
    return false;
  });
  return ran ?? false;
}

/** アプリ起動中のみ動作するタイマー駆動の自動バックアップ。 */
export function useAutoBackup(): void {
  const auto = useApp((s) => s.settings.backup.auto);
  const intervalMin = useApp((s) => s.settings.backup.intervalMin);
  const ready = useApp((s) => s.ready);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearInterval(timer.current);
    if (!ready || !auto || intervalMin <= 0 || isDemoMode()) return;

    const tick = () => {
      const { settings } = useApp.getState();
      const due = Date.now() - settings.backup.lastAt >= settings.backup.intervalMin * 60_000;
      if (due && (isDbDirty() || settings.backup.lastAt === 0)) {
        void performBackup(true);
      }
    };

    timer.current = window.setInterval(tick, 60_000);
    const first = window.setTimeout(tick, 8_000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
      window.clearTimeout(first);
    };
  }, [auto, intervalMin, ready]);
}
