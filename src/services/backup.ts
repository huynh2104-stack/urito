import { db, kvDelete, kvGet, kvSet, BACKUP_TABLES, type BackupTable } from '@/db/db';
import type { Order, Settings, StockMovement } from '@/db/types';

/* The File System Access API is not in lib.dom yet, so declare the slice we use. */
type PermissionState2 = 'granted' | 'denied' | 'prompt';
interface FsPermissionDescriptor {
  mode: 'read' | 'readwrite';
}
interface FsWritable {
  write: (data: string | Blob) => Promise<void>;
  close: () => Promise<void>;
}
export interface FsFileHandle {
  kind: 'file';
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<FsWritable>;
}
export interface FsDirectoryHandle {
  kind: 'directory';
  name: string;
  getFileHandle: (name: string, opts?: { create?: boolean }) => Promise<FsFileHandle>;
  removeEntry: (name: string, opts?: { recursive?: boolean }) => Promise<void>;
  queryPermission?: (d: FsPermissionDescriptor) => Promise<PermissionState2>;
  requestPermission?: (d: FsPermissionDescriptor) => Promise<PermissionState2>;
  values: () => AsyncIterableIterator<FsFileHandle | FsDirectoryHandle>;
}
declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<FsDirectoryHandle>;
  }
}

const HANDLE_KEY = 'backup.dirHandle';
const FILE_PREFIX = 'urito-backup-';
export const BACKUP_FORMAT = 1;

export interface Snapshot {
  app: 'urito';
  format: number;
  createdAt: number;
  shopName: string;
  appVersion: string;
  counts: Record<string, number>;
  data: Record<string, unknown[]>;
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/* ------------------------------------------------------------ snapshotting */

export async function createSnapshot(appVersion: string): Promise<Snapshot> {
  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const name of BACKUP_TABLES) {
    const rows = await (db as unknown as Record<BackupTable, { toArray: () => Promise<unknown[]> }>)[name].toArray();
    data[name] = rows;
    counts[name] = rows.length;
  }
  const settings = (data.settings?.[0] ?? {}) as Partial<Settings>;
  return {
    app: 'urito',
    format: BACKUP_FORMAT,
    createdAt: Date.now(),
    shopName: settings.shopName ?? '',
    appVersion,
    counts,
    data,
  };
}

export function snapshotFileName(at = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${FILE_PREFIX}${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}.json`;
}

export function isSnapshot(value: unknown): value is Snapshot {
  const v = value as Snapshot | null;
  return !!v && v.app === 'urito' && typeof v.format === 'number' && !!v.data && typeof v.data === 'object';
}

/** B-08: バックアップファイルのレコード検証エラー（テーブル名と行番号を保持する）。 */
export class BackupValidationError extends Error {
  constructor(
    public readonly table: string,
    public readonly index: number,
    public readonly reason: string,
  ) {
    super(index >= 0 ? `${table}[${index}]: ${reason}` : `${table}: ${reason}`);
    this.name = 'BackupValidationError';
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** B-08: 復元前にテーブル単位・行単位でスナップショットの妥当性を検証する。 */
export function validateSnapshot(value: unknown): Snapshot {
  if (!isPlainRecord(value)) throw new BackupValidationError('snapshot', -1, 'invalid root object');
  if (value.app !== 'urito' || typeof value.format !== 'number') {
    throw new BackupValidationError('snapshot', -1, 'unsupported format');
  }
  if (!isPlainRecord(value.data)) throw new BackupValidationError('data', -1, 'missing data object');

  const data = value.data;
  for (const table of BACKUP_TABLES) {
    const rows = data[table];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) throw new BackupValidationError(table, -1, 'expected array');
    for (let i = 0; i < rows.length; i++) {
      const row: unknown = rows[i];
      if (!isPlainRecord(row)) throw new BackupValidationError(table, i, 'row must be object');
      if (typeof row.id !== 'string' || !row.id.trim()) {
        throw new BackupValidationError(table, i, 'missing string id');
      }
      if (table === 'products') {
        if (typeof row.name !== 'string') throw new BackupValidationError(table, i, 'missing product name');
        if (!Number.isFinite(row.price) || (row.price as number) < 0) {
          throw new BackupValidationError(table, i, 'invalid price');
        }
        if (!Number.isFinite(row.stock)) throw new BackupValidationError(table, i, 'invalid stock');
      } else if (table === 'orders') {
        if (!Array.isArray(row.items)) throw new BackupValidationError(table, i, 'missing items array');
        if (!Number.isFinite(row.total) || (row.total as number) < 0) {
          throw new BackupValidationError(table, i, 'invalid total');
        }
        if (typeof row.status !== 'string') throw new BackupValidationError(table, i, 'missing status');
      } else if (table === 'shifts') {
        if (typeof row.status !== 'string' || !Number.isFinite(row.openedAt)) {
          throw new BackupValidationError(table, i, 'invalid shift fields');
        }
      } else if (
        table === 'customers' ||
        table === 'users' ||
        table === 'categories' ||
        table === 'modifierGroups' ||
        table === 'suppliers' ||
        table === 'areas' ||
        table === 'diningTables' ||
        table === 'promotions'
      ) {
        if (typeof row.name !== 'string') throw new BackupValidationError(table, i, 'missing name');
      } else if (table === 'expenses') {
        if (!Number.isFinite(row.amount)) throw new BackupValidationError(table, i, 'invalid amount');
      } else if (table === 'stockMovements') {
        if (typeof row.productId !== 'string' || !Number.isFinite(row.qty)) {
          throw new BackupValidationError(table, i, 'invalid movement fields');
        }
      } else if (table === 'purchases') {
        if (!Array.isArray(row.items) || !Number.isFinite(row.total)) {
          throw new BackupValidationError(table, i, 'invalid purchase fields');
        }
      } else if (table === 'cashMovements') {
        if (!Number.isFinite(row.amount) || typeof row.shiftId !== 'string') {
          throw new BackupValidationError(table, i, 'invalid cash movement');
        }
      }
    }
  }
  return value as unknown as Snapshot;
}

export function snapshotRecordCount(snap: Snapshot): number {
  return Object.values(snap.counts ?? {}).reduce((s, n) => s + n, 0);
}

/* ------------------------------------------------------------- the folder */

export async function chooseBackupFolder(): Promise<FsDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) return null;
  const handle = await window.showDirectoryPicker!({ mode: 'readwrite', id: 'urito-backup' });
  await kvSet(HANDLE_KEY, handle);
  return handle;
}

export async function getStoredFolder(): Promise<FsDirectoryHandle | null> {
  const handle = await kvGet<FsDirectoryHandle>(HANDLE_KEY);
  return handle ?? null;
}

export async function forgetFolder(): Promise<void> {
  await kvDelete(HANDLE_KEY);
}

export async function folderPermission(handle: FsDirectoryHandle): Promise<PermissionState2> {
  if (!handle.queryPermission) return 'granted';
  return handle.queryPermission({ mode: 'readwrite' });
}

/** Must be called from a user gesture when the permission has lapsed. */
export async function ensureFolderPermission(handle: FsDirectoryHandle): Promise<boolean> {
  const state = await folderPermission(handle);
  if (state === 'granted') return true;
  if (!handle.requestPermission) return false;
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
}

/* --------------------------------------------------------------- writing */

export interface BackupFileInfo {
  name: string;
  size: number;
  modifiedAt: number;
}

export async function listBackupFiles(handle: FsDirectoryHandle): Promise<BackupFileInfo[]> {
  const out: BackupFileInfo[] = [];
  for await (const entry of handle.values()) {
    if (entry.kind !== 'file' || !entry.name.startsWith(FILE_PREFIX)) continue;
    const file = await entry.getFile();
    out.push({ name: entry.name, size: file.size, modifiedAt: file.lastModified });
  }
  return out.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

/** Writes a snapshot into the chosen folder and prunes the oldest files. */
export async function writeBackupToFolder(
  handle: FsDirectoryHandle,
  snapshot: Snapshot,
  keep: number,
): Promise<string> {
  const name = snapshotFileName(new Date(snapshot.createdAt));
  const fileHandle = await handle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(snapshot));
  await writable.close();

  if (keep > 0) {
    const files = await listBackupFiles(handle);
    for (const old of files.slice(keep)) {
      try {
        await handle.removeEntry(old.name);
      } catch {
        /* a locked or already-removed file must not fail the backup */
      }
    }
  }
  return name;
}

export function downloadSnapshot(snapshot: Snapshot): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = snapshotFileName(new Date(snapshot.createdAt));
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* -------------------------------------------------------------- restoring */

export async function readSnapshotFile(file: File): Promise<Snapshot> {
  const text = await file.text();
  const parsed: unknown = JSON.parse(text);
  return validateSnapshot(parsed);
}

export async function restoreSnapshot(snapshot: Snapshot): Promise<void> {
  const valid = validateSnapshot(snapshot);
  const tables = BACKUP_TABLES.map(
    (name) => (db as unknown as Record<BackupTable, { clear: () => Promise<void>; bulkPut: (rows: unknown[]) => Promise<unknown> }>)[name],
  );
  await db.transaction('rw', tables as never, async () => {
    for (const name of BACKUP_TABLES) {
      const table = (db as unknown as Record<BackupTable, { clear: () => Promise<void>; bulkPut: (rows: unknown[]) => Promise<unknown> }>)[name];
      await table.clear();
      const rows = valid.data[name];
      if (Array.isArray(rows) && rows.length) await table.bulkPut(rows);
    }
  });
}

/* ---------------------------------------------------------- orchestration */

export interface BackupResult {
  ok: boolean;
  fileName?: string;
  error?: string;
}

/** One-shot backup used by the button, the timer and the invoice counter. */
export async function runBackup(appVersion: string, keep: number): Promise<BackupResult> {
  const handle = await getStoredFolder();
  if (!handle) return { ok: false, error: 'no-folder' };
  const permitted = (await folderPermission(handle)) === 'granted';
  if (!permitted) return { ok: false, error: 'permission' };
  try {
    const snapshot = await createSnapshot(appVersion);
    const fileName = await writeBackupToFolder(handle, snapshot, keep);
    return { ok: true, fileName };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}

/** Rough size of the IndexedDB database, for the settings screen. */
export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const est = await navigator.storage.estimate();
  return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
}

/** Ask the browser not to evict our data when disk gets tight. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted?.()) return true;
  return navigator.storage.persist();
}

/* ------------------------------------------------------ device-to-device merge */

export interface MergeResult {
  added: Record<string, number>;
  stockAdjusted: number;
  renamedCodes: number;
}

/** Brings records made on another device (a phone used during a power cut)
 *  into this one WITHOUT overwriting anything already here:
 *   - only rows whose id is new are inserted, so running it twice is harmless;
 *   - stock movements for products this device already had are replayed onto
 *     the local stock figure, so inventory stays right on both sides;
 *   - customer points / debt / spend from the imported sales are applied;
 *   - an imported invoice number that clashes with a local one gets a suffix.
 *  Settings stay local on purpose - each device keeps its own printer, prefix... */
export async function mergeSnapshot(snapshot: Snapshot): Promise<MergeResult> {
  type AnyTable = {
    toCollection: () => { primaryKeys: () => Promise<string[]> };
    bulkAdd: (rows: unknown[]) => Promise<unknown>;
  };
  const tables = db as unknown as Record<BackupTable, AnyTable>;
  const names = BACKUP_TABLES.filter((n) => n !== 'settings');
  const result: MergeResult = { added: {}, stockAdjusted: 0, renamedCodes: 0 };

  await db.transaction('rw', names.map((n) => tables[n]) as never, async () => {
    const existingIds = new Map<string, Set<string>>();
    for (const name of names) {
      existingIds.set(name, new Set(await tables[name].toCollection().primaryKeys()));
    }
    const hadProduct = existingIds.get('products')!;
    const hadCustomer = existingIds.get('customers')!;
    const codeKeys = await db.orders.orderBy('code').uniqueKeys();
    const localCodes = new Set(codeKeys.filter((k): k is string => typeof k === 'string' && k !== ''));

    const incoming = <T extends { id: string }>(name: BackupTable): T[] => {
      const rows = (snapshot.data[name] ?? []) as T[];
      const have = existingIds.get(name)!;
      return rows.filter((r) => r && typeof r.id === 'string' && !have.has(r.id));
    };

    const newOrders = incoming<Order>('orders').map((o) => {
      if (o.code && localCodes.has(o.code)) {
        result.renamedCodes += 1;
        return { ...o, code: `${o.code}-M` };
      }
      return o;
    });
    const newMovements = incoming<StockMovement>('stockMovements');

    for (const name of names) {
      const rows = name === 'orders' ? newOrders : incoming<{ id: string }>(name);
      if (rows.length) await tables[name].bulkAdd(rows);
      result.added[name] = rows.length;
    }

    // Replay stock changes onto products that existed here before the merge.
    const deltas = new Map<string, number>();
    for (const m of newMovements) {
      if (hadProduct.has(m.productId)) deltas.set(m.productId, (deltas.get(m.productId) ?? 0) + m.qty);
    }
    for (const [productId, delta] of deltas) {
      const product = await db.products.get(productId);
      if (!product || delta === 0) continue;
      await db.products.update(productId, {
        stock: Math.round((product.stock + delta) * 1000) / 1000,
        updatedAt: Date.now(),
      });
      result.stockAdjusted += 1;
    }

    // Apply the imported sales to customers this device already knew.
    for (const order of newOrders) {
      if (!order.customerId || !hadCustomer.has(order.customerId)) continue;
      if (order.status !== 'paid' && order.status !== 'refunded') continue;
      const customer = await db.customers.get(order.customerId);
      if (!customer) continue;
      await db.customers.put({
        ...customer,
        points: Math.max(0, customer.points - order.pointsUsed + order.pointsEarned),
        debt: customer.debt + order.dueAmount,
        totalSpent: customer.totalSpent + order.total - order.refundedAmount,
        orderCount: customer.orderCount + 1,
        updatedAt: Date.now(),
      });
    }
  });

  return result;
}

/** Hand a snapshot to another device. On phones this opens the share sheet
 *  (Zalo, Messenger, Drive, email...); elsewhere it downloads the file. */
export async function shareSnapshot(snapshot: Snapshot, title: string): Promise<'shared' | 'downloaded'> {
  const body = JSON.stringify(snapshot);
  // Android only shares whitelisted types, and .json is not on the list - .txt is.
  const shareName = snapshotFileName(new Date(snapshot.createdAt)).replace(/\.json$/, '.txt');
  const file = new File([body], shareName, { type: 'text/plain' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
    }
  }
  downloadSnapshot(snapshot);
  return 'downloaded';
}
