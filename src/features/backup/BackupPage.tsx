import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Field, Modal, NumberInput, Select, Stat, SwitchRow } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { db } from '@/db/db';
import {
  downloadPreUpgradeBackup,
  listPreUpgradeBackups,
  type PreUpgradeBackupInfo,
} from '@/db/preUpgrade';
import { formatDateTime } from '@/core/date';
import { formatAmount } from '@/core/money';
import { APP_VERSION } from '@/version';
import { useApp, useT } from '@/store/app';
import { toast } from '@/store/ui';
import { downloadCsv, timestampedName } from '@/services/csv';
import { downloadDiagnosticLog } from '@/lib/errorLog';
import { rebuildRollups } from '@/services/rollups';
import {
  BackupValidationError,
  chooseBackupFolder,
  createSnapshot,
  downloadLiveSnapshot,
  ensureFolderPermission,
  folderPermission,
  getStoredFolder,
  listBackupFiles,
  readSnapshotFile,
  restoreSnapshot,
  snapshotRecordCount,
  isFileSystemAccessSupported,
  mergeSnapshot,
  shareSnapshot,
  type MergeResult,
  type BackupFileInfo,
  type FsDirectoryHandle,
  type Snapshot,
} from '@/services/backup';
import { performBackup } from './useAutoBackup';

export function BackupPage() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const lang = settings.lang;
  const supported = isFileSystemAccessSupported();

  const [handle, setHandle] = useState<FsDirectoryHandle | null>(null);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const [files, setFiles] = useState<BackupFileInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ snapshot: Snapshot; name: string; fromFolder?: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const mergeInput = useRef<HTMLInputElement>(null);
  const [merging, setMerging] = useState<{ snapshot: Snapshot; name: string } | null>(null);
  const [merged, setMerged] = useState<MergeResult | null>(null);
  const [preUpgradeFiles, setPreUpgradeFiles] = useState<PreUpgradeBackupInfo[]>([]);

  const refreshFiles = useCallback(async (dir: FsDirectoryHandle) => {
    try {
      setFiles(await listBackupFiles(dir));
    } catch {
      setFiles([]);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setPreUpgradeFiles(await listPreUpgradeBackups());
      const stored = await getStoredFolder();
      if (!stored) return;
      setHandle(stored);
      const state = await folderPermission(stored);
      setPermission(state);
      if (state === 'granted') await refreshFiles(stored);
    })();
  }, [refreshFiles]);

  const pickFolder = async () => {
    try {
      const dir = await chooseBackupFolder();
      if (!dir) return;
      setHandle(dir);
      setPermission('granted');
      await updateSettings({ backup: { ...settings.backup, folderLabel: dir.name, lastError: '' } });
      await refreshFiles(dir);
      toast.success(t('bak.folderSelected', { name: dir.name }));
    } catch {
      /* ユーザーがフォルダ選択ダイアログを閉じた場合は無視 */
    }
  };

  const regrant = async () => {
    if (!handle) return;
    const ok = await ensureFolderPermission(handle);
    setPermission(ok ? 'granted' : 'denied');
    if (ok) await refreshFiles(handle);
  };

  const backupNow = async () => {
    setBusy(true);
    try {
      if (!handle) {
        await downloadLiveSnapshot(APP_VERSION);
        toast.success(t('common.saved'));
        return;
      }
      const ok = await performBackup(false);
      if (ok) await refreshFiles(handle);
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    setBusy(true);
    try {
      await downloadLiveSnapshot(APP_VERSION);
    } finally {
      setBusy(false);
    }
  };

  const downloadFull = async () => {
    setBusy(true);
    try {
      await downloadLiveSnapshot(APP_VERSION, { includeImages: true });
    } finally {
      setBusy(false);
    }
  };

  const pickRestoreFile = async (file: File, fromFolder = false) => {
    try {
      const snapshot = await readSnapshotFile(file);
      setPending({ snapshot, name: file.name, fromFolder });
    } catch (err) {
      toast.error(
        err instanceof BackupValidationError ? `${t('bak.restoreInvalid')} (${err.message})` : t('bak.restoreInvalid'),
      );
    }
  };

  const restoreFromFolder = async (info: BackupFileInfo) => {
    if (!handle) return;
    const fileHandle = await handle.getFileHandle(info.name);
    const file = await fileHandle.getFile();
    await pickRestoreFile(file, true);
  };

  const doRestore = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await restoreSnapshot(pending.snapshot, pending.fromFolder ? handle : null);
      toast.success(t('bak.restoreDone'));
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      toast.error(
        err instanceof BackupValidationError ? `${t('bak.restoreInvalid')} (${err.message})` : t('common.error'),
      );
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const sendToDevice = async () => {
    const how = await shareSnapshot(await createSnapshot(APP_VERSION), settings.shopName || 'Urito');
    if (how === 'downloaded') toast.success(t('sync.downloaded'));
  };

  const pickMergeFile = async (file: File) => {
    try {
      setMerging({ snapshot: await readSnapshotFile(file), name: file.name });
    } catch (err) {
      toast.error(
        err instanceof BackupValidationError ? `${t('bak.restoreInvalid')} (${err.message})` : t('bak.restoreInvalid'),
      );
    }
  };

  const doMerge = async () => {
    if (!merging) return;
    setBusy(true);
    try {
      setMerged(await mergeSnapshot(merging.snapshot));
      await useApp.getState().reloadUsers();
      toast.success(t('sync.mergeDone'));
    } catch (err) {
      console.error(err);
      toast.error(t('common.error'));
    } finally {
      setBusy(false);
      setMerging(null);
    }
  };

  const exportProducts = async () => {
    const [products, categories] = await Promise.all([db.products.toArray(), db.categories.toArray()]);
    const names = new Map(categories.map((c) => [c.id, c.name]));
    downloadCsv(timestampedName('urito-products'), [
      ['name', 'price', 'cost', 'category', 'sku', 'barcode', 'stock'],
      ...products.map((p) => [
        p.name,
        formatAmount(p.price, settings.currency, 'en'),
        formatAmount(p.cost, settings.currency, 'en'),
        names.get(p.categoryId) ?? '',
        p.sku,
        p.barcode,
        p.stock,
      ]),
    ]);
  };

  const exportOrders = async () => {
    const orders = await db.orders.toArray();
    downloadCsv(timestampedName('urito-orders'), [
      ['code', 'datetime', 'status', 'type', 'customer', 'cashier', 'subtotal', 'discount', 'tax', 'total'],
      ...orders.map((o) => [
        o.code,
        formatDateTime(o.paidAt || o.createdAt, 'en'),
        o.status,
        o.type,
        o.customerName,
        o.userName,
        formatAmount(o.subtotal, settings.currency, 'en'),
        formatAmount(o.discount, settings.currency, 'en'),
        formatAmount(o.tax, settings.currency, 'en'),
        formatAmount(o.total, settings.currency, 'en'),
      ]),
    ]);
  };

  const lastBackup = settings.backup.lastAt ? formatDateTime(settings.backup.lastAt, lang) : t('common.never');

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <div className="page-title">{t('bak.title')}</div>
          <div className="page-sub">{t('bak.intro')}</div>
        </div>
        <Button variant="primary" icon="cloud" onClick={() => void backupNow()} disabled={busy}>
          {t('bak.backupNow')}
        </Button>
      </div>

      <div className="grid grid-3 mb-16">
        <Stat label={t('bak.lastBackup')} value={lastBackup} />
        <Stat label={t('bak.folder')} value={handle ? handle.name : t('bak.noFolder')} />
        <Stat label={t('bak.history')} value={String(files.length)} />
      </div>

      {!supported && <div className="callout callout-warn mb-16">{t('bak.unsupported')}</div>}

      <div className="card card-body col gap-12 mb-16">
        <div className="card-title">{t('bak.folder')}</div>

        {handle ? (
          <div className="callout callout-success">
            <div className="row between wrap gap-8">
              <span className="row gap-8">
                <Icon name="folder" size={16} />
                {t('bak.folderSelected', { name: handle.name })}
              </span>
              <span className="row gap-8">
                {permission !== 'granted' && (
                  <Button size="sm" variant="primary" onClick={() => void regrant()}>
                    {t('common.confirm')}
                  </Button>
                )}
                <Button size="sm" onClick={() => void pickFolder()}>
                  {t('bak.changeFolder')}
                </Button>
              </span>
            </div>
            {permission !== 'granted' && <div className="mt-8 text-warn">{t('bak.permissionLost')}</div>}
          </div>
        ) : (
          <Button icon="folder" onClick={() => void pickFolder()} disabled={!supported}>
            {t('bak.chooseFolder')}
          </Button>
        )}

        <SwitchRow
          label={t('bak.auto')}
          checked={settings.backup.auto}
          disabled={!handle}
          onChange={(v) => void updateSettings({ backup: { ...settings.backup, auto: v } })}
        />

        {settings.backup.auto && (
          <div className="grid grid-3">
            <Field label={t('bak.interval')}>
              <Select
                value={String(settings.backup.intervalMin)}
                onChange={(e) =>
                  void updateSettings({
                    backup: { ...settings.backup, intervalMin: Number(e.target.value) },
                  })
                }
              >
                {[10, 15, 30, 60, 120, 240].map((m) => (
                  <option key={m} value={m}>
                    {t('bak.minutes', { n: m })}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('bak.keep')}>
              <NumberInput
                value={settings.backup.keep}
                min={1}
                max={200}
                onChange={(v) => void updateSettings({ backup: { ...settings.backup, keep: v } })}
              />
            </Field>
            <Field label={t('bak.onOrders')} hint={settings.backup.onOrderCount ? '' : t('bak.onOrdersOff')}>
              <NumberInput
                value={settings.backup.onOrderCount}
                min={0}
                max={500}
                onChange={(v) => void updateSettings({ backup: { ...settings.backup, onOrderCount: v } })}
              />
            </Field>
          </div>
        )}

        {settings.backup.lastError && (
          <div className="callout callout-danger">
            {t('bak.backupFailed', { error: settings.backup.lastError })}
          </div>
        )}
      </div>

      <div className="card card-body mb-16">
        <div className="card-title mb-12">{t('bak.cloudTitle')}</div>
        <ol className="col gap-8" style={{ margin: 0, paddingLeft: 18 }}>
          <li>{t('bak.cloudStep1')}</li>
          <li>{t('bak.cloudStep2')}</li>
          <li>{t('bak.cloudStep3')}</li>
          <li>{t('bak.cloudStep4')}</li>
        </ol>
      </div>

      {handle && (
        <div className="card mb-16">
          <div className="card-head">
            <span className="card-title">{t('bak.history')}</span>
            <Button
              size="sm"
              variant="ghost"
              icon="refresh"
              aria-label={t('common.refresh')}
              onClick={() => void refreshFiles(handle)}
            />
          </div>
          {files.length === 0 ? (
            <div className="empty small">{t('bak.noHistory')}</div>
          ) : (
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {files.map((f) => (
                <div key={f.name} className="list-row">
                  <div className="grow">
                    <div className="mono small">{f.name}</div>
                    <div className="tiny dim">{formatDateTime(f.modifiedAt, lang)}</div>
                  </div>
                  <span className="small dim num">{(f.size / 1024).toFixed(0)} KB</span>
                  <Button size="sm" onClick={() => void restoreFromFolder(f)}>
                    {t('bak.restore')}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card card-body col gap-12 mb-16">
        <div className="row gap-8">
          <Icon name="refresh" size={18} />
          <div className="card-title">{t('sync.title')}</div>
        </div>
        <div className="small muted">{t('sync.intro')}</div>
        <ol className="col gap-4 small" style={{ margin: 0, paddingLeft: 18 }}>
          <li>{t('sync.step1')}</li>
          <li>{t('sync.step2')}</li>
          <li>{t('sync.step3')}</li>
        </ol>
        <div className="row wrap gap-8">
          <Button variant="primary" icon="upload" onClick={() => void sendToDevice()}>
            {t('sync.send')}
          </Button>
          <Button icon="download" onClick={() => mergeInput.current?.click()}>
            {t('sync.merge')}
          </Button>
          <input
            ref={mergeInput}
            type="file"
            accept=".json,.json.gz,.gz,.txt,application/json,application/gzip,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void pickMergeFile(file);
              e.target.value = '';
            }}
          />
        </div>
        {merged && (
          <div className="callout callout-success">
            <div className="strong mb-8">{t('sync.mergeDone')}</div>
            <div className="small">
              {t('sync.mergeSummary', {
                orders: merged.added.orders ?? 0,
                products: merged.added.products ?? 0,
                customers: merged.added.customers ?? 0,
                stock: merged.stockAdjusted,
              })}
            </div>
          </div>
        )}
      </div>

      <div className="card card-body col gap-12">
        <div className="card-title">{t('bak.restore')}</div>
        <div className="callout callout-warn">{t('bak.restoreWarning')}</div>
        <div className="row wrap gap-8">
          <Button icon="download" disabled={busy} onClick={() => void download()}>
            {t('bak.downloadFile')}
          </Button>
          <Button icon="image" disabled={busy} onClick={() => void downloadFull()}>
            {t('bak.downloadFullWithImages')}
          </Button>
          <Button icon="upload" onClick={() => fileInput.current?.click()}>
            {t('bak.restoreFile')}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,.json.gz,.gz,.txt,.urito.json,application/json,application/gzip,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void pickRestoreFile(file);
              e.target.value = '';
            }}
          />
          <span className="grow" />
          <Button icon="box" onClick={() => void exportProducts()}>
            {t('bak.exportProducts')}
          </Button>
          <Button icon="receipt" onClick={() => void exportOrders()}>
            {t('bak.exportOrders')}
          </Button>
          <Button
            icon="refresh"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void rebuildRollups()
                .then(() => toast.success(t('bak.rebuildDone')))
                .finally(() => setBusy(false));
            }}
          >
            {t('bak.rebuildRollups')}
          </Button>
          <Button icon="info" onClick={() => void downloadDiagnosticLog()}>
            {t('bak.diagExport')}
          </Button>
        </div>
        <div className="hint">{t('bak.downloadFullHint')}</div>
      </div>

      {preUpgradeFiles.length > 0 && (
        <div className="card mb-16">
          <div className="card-head">
            <div>
              <div className="card-title">{t('bak.preUpgradeTitle')}</div>
              <div className="hint">{t('bak.preUpgradeDesc')}</div>
            </div>
          </div>
          {preUpgradeFiles.map((f) => (
            <div key={f.name} className="list-row">
              <div className="grow">
                <div className="mono small">{f.name}</div>
                <div className="tiny dim">{formatDateTime(f.lastModified, lang)}</div>
              </div>
              <span className="small dim num">{(f.size / 1024).toFixed(0)} KB</span>
              <Button size="sm" onClick={() => void downloadPreUpgradeBackup(f.name)}>
                {t('bak.preUpgradeDownload')}
              </Button>
            </div>
          ))}
        </div>
      )}

      {merging && (
        <Modal
          open
          onClose={() => setMerging(null)}
          size="sm"
          title={t('sync.merge')}
          footer={
            <>
              <Button onClick={() => setMerging(null)}>{t('common.cancel')}</Button>
              <Button variant="primary" disabled={busy} onClick={() => void doMerge()}>
                {t('common.confirm')}
              </Button>
            </>
          }
        >
          <div className="callout mb-12">{t('sync.mergeSafe')}</div>
          <div className="small">
            <div className="strong">{merging.snapshot.shopName || merging.name}</div>
            <div className="muted">
              {formatDateTime(merging.snapshot.createdAt, lang)} ·{' '}
              {t('bak.records', { n: snapshotRecordCount(merging.snapshot) })}
            </div>
          </div>
        </Modal>
      )}

      {pending && (
        <Modal
          open
          onClose={() => setPending(null)}
          size="sm"
          title={t('bak.restore')}
          footer={
            <>
              <Button onClick={() => setPending(null)}>{t('common.cancel')}</Button>
              <Button variant="danger" disabled={busy} onClick={() => void doRestore()}>
                {t('common.confirm')}
              </Button>
            </>
          }
        >
          <div className="callout callout-warn mb-12">{t('bak.restoreWarning')}</div>
          <p>
            {t('bak.restoreConfirm', {
              name: pending.name,
              date: formatDateTime(pending.snapshot.createdAt, lang),
            })}
          </p>
          <div className="small muted">
            {pending.snapshot.shopName} · {t('bak.records', { n: snapshotRecordCount(pending.snapshot) })}
          </div>
        </Modal>
      )}
    </div>
  );
}
