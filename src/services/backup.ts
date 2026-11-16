import { clearDbDirty, db, kvDelete, kvGet, kvSet, BACKUP_TABLES, type BackupTable } from '@/db/db';
import { rebuildRollups, yieldToMain } from './rollups';
import { hashPin } from '@/core/pin';
import { arrayBufferToBase64, base64ToArrayBuffer, mimeToExt } from '@/lib/image';
import type { Order, Product, ProductImageRow, Settings, StockMovement } from '@/db/types';

/* File System Access API の一部型が lib.dom に未収録のため、使用箇所のみ最小宣言する。 */
type PermissionState2 = 'granted' | 'denied' | 'prompt';
interface FsPermissionDescriptor {
  mode: 'read' | 'readwrite';
}
interface FsWritable {
  write: (data: string | Blob | BufferSource) => Promise<void>;
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
  getDirectoryHandle?: (name: string, opts?: { create?: boolean }) => Promise<FsDirectoryHandle>;
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
const BACKUP_BATCH = 500;
const IMAGE_BATCH = 50;
export const BACKUP_FORMAT = 2;

export interface SnapshotImageRow {
  productId: string;
  mime: string;
  w: number;
  h: number;
  rev: number;
  data: string;
}

export interface Snapshot {
  app: 'urito';
  format: number;
  createdAt: number;
  shopName: string;
  appVersion: string;
  counts: Record<string, number>;
  data: Record<string, unknown[]>;
  images?: SnapshotImageRow[];
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/* ---------------------------------------------------- スナップショット作成 */

function sanitizeBackupRow(table: BackupTable, row: unknown): unknown {
  // B-06: バックアップJSONには平文PINを絶対に含めない
  if (table === 'users' && isPlainRecord(row)) return { ...row, pin: '' };
  return row;
}

async function readAllImagesEncoded(): Promise<SnapshotImageRow[]> {
  const out: SnapshotImageRow[] = [];
  const rows = await db.productImages.toArray();
  for (let i = 0; i < rows.length; i++) {
    const img = rows[i];
    out.push({
      productId: img.productId,
      mime: img.mime,
      w: img.w,
      h: img.h,
      rev: img.rev,
      data: arrayBufferToBase64(img.bytes),
    });
    if ((i + 1) % IMAGE_BATCH === 0) await yieldToMain();
  }
  return out;
}

export async function createSnapshot(appVersion: string, opts?: { includeImages?: boolean }): Promise<Snapshot> {
  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const name of BACKUP_TABLES) {
    const rawRows = await (db as unknown as Record<BackupTable, { toArray: () => Promise<unknown[]> }>)[name].toArray();
    const rows = name === 'users' ? rawRows.map((r) => sanitizeBackupRow(name, r)) : rawRows;
    data[name] = rows;
    counts[name] = rows.length;
  }
  const settings = (data.settings?.[0] ?? {}) as Partial<Settings>;
  const snap: Snapshot = {
    app: 'urito',
    format: BACKUP_FORMAT,
    createdAt: Date.now(),
    shopName: settings.shopName ?? '',
    appVersion,
    counts,
    data,
  };
  if (opts?.includeImages) {
    snap.images = await readAllImagesEncoded();
  }
  return snap;
}

export function isGzipSupported(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

export function snapshotFileName(at = new Date(), gzip = isGzipSupported()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const ext = gzip ? '.json.gz' : '.json';
  return `${FILE_PREFIX}${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}${ext}`;
}

export async function gzipCompressString(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

export async function gzipDecompressBytes(buf: ArrayBuffer): Promise<string> {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export async function encodeSnapshotBlob(snapshot: Snapshot): Promise<{ fileName: string; blob: Blob }> {
  if (isGzipSupported()) {
    const compressed = await gzipCompressString(JSON.stringify(snapshot));
    return {
      fileName: snapshotFileName(new Date(snapshot.createdAt), true),
      blob: new Blob([compressed], { type: 'application/gzip' }),
    };
  }
  return {
    fileName: snapshotFileName(new Date(snapshot.createdAt), false),
    blob: new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }),
  };
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
  if (value.images !== undefined) {
    if (!Array.isArray(value.images)) throw new BackupValidationError('images', -1, 'expected array');
    for (let i = 0; i < value.images.length; i++) {
      const img: unknown = value.images[i];
      if (!isPlainRecord(img)) throw new BackupValidationError('images', i, 'row must be object');
      if (typeof img.productId !== 'string' || !img.productId.trim()) {
        throw new BackupValidationError('images', i, 'missing productId');
      }
      if (typeof img.mime !== 'string' || typeof img.data !== 'string' || !Number.isFinite(img.rev)) {
        throw new BackupValidationError('images', i, 'invalid image metadata');
      }
    }
  }
  return value as unknown as Snapshot;
}

export function snapshotRecordCount(snap: Snapshot): number {
  return Object.values(snap.counts ?? {}).reduce((s, n) => s + n, 0);
}

/* ---------------------------------------------- ストリーミング生成 (C-06) */

function canStreamGzip(): boolean {
  return isGzipSupported() && typeof TextEncoderStream !== 'undefined' && typeof ReadableStream !== 'undefined';
}

/**
 * C-06: 10万件規模でもヒープを圧迫しないよう、バックアップ開始時点の最大IDを上限として
 * 500件単位で主キー走査しながら JSON 文字列チャンクを逐次生成する。
 */
export function createSnapshotTextStream(
  appVersion: string,
  createdAt = Date.now(),
  opts?: { includeImages?: boolean },
): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      try {
        const settings = await db.settings.get('app');
        const counts: Record<string, number> = {};
        const header = {
          app: 'urito',
          format: BACKUP_FORMAT,
          createdAt,
          shopName: settings?.shopName ?? '',
          appVersion,
        };
        const headJson = JSON.stringify(header);
        controller.enqueue(`${headJson.slice(0, -1)},"data":{`);

        for (let tIdx = 0; tIdx < BACKUP_TABLES.length; tIdx++) {
          const name = BACKUP_TABLES[tIdx];
          if (tIdx > 0) controller.enqueue(',');
          controller.enqueue(`${JSON.stringify(name)}:[`);

          const tbl = db.table(name);
          const maxKey = await tbl.orderBy(':id').lastKey();
          let written = 0;
          if (typeof maxKey === 'string') {
            let cursor: string | null = null;
            let firstRow = true;
            while (true) {
              const batch: unknown[] =
                cursor === null
                  ? await tbl.where(':id').belowOrEqual(maxKey).limit(BACKUP_BATCH).toArray()
                  : await tbl.where(':id').between(cursor, maxKey, false, true).limit(BACKUP_BATCH).toArray();
              if (!batch.length) break;
              const last = batch[batch.length - 1] as { id: string };
              cursor = last.id;

              const chunk = batch
                .map((row) => JSON.stringify(sanitizeBackupRow(name, row)))
                .join(',');
              controller.enqueue(firstRow ? chunk : `,${chunk}`);
              firstRow = false;
              written += batch.length;

              if (batch.length < BACKUP_BATCH || cursor === maxKey) break;
              await yieldToMain();
            }
          }
          counts[name] = written;
          controller.enqueue(']');
        }

        controller.enqueue(`},"counts":${JSON.stringify(counts)}`);

        if (opts?.includeImages) {
          controller.enqueue(',"images":[');
          const maxImgKey = await db.productImages.orderBy(':id').lastKey();
          if (typeof maxImgKey === 'string') {
            let cursor: string | null = null;
            let firstImg = true;
            while (true) {
              const batch: ProductImageRow[] =
                cursor === null
                  ? await db.productImages.where(':id').belowOrEqual(maxImgKey).limit(IMAGE_BATCH).toArray()
                  : await db.productImages.where(':id').between(cursor, maxImgKey, false, true).limit(IMAGE_BATCH).toArray();
              if (!batch.length) break;
              cursor = batch[batch.length - 1].productId;
              const chunk = batch
                .map((img) =>
                  JSON.stringify({
                    productId: img.productId,
                    mime: img.mime,
                    w: img.w,
                    h: img.h,
                    rev: img.rev,
                    data: arrayBufferToBase64(img.bytes),
                  } satisfies SnapshotImageRow),
                )
                .join(',');
              controller.enqueue(firstImg ? chunk : `,${chunk}`);
              firstImg = false;
              if (batch.length < IMAGE_BATCH || cursor === maxImgKey) break;
              await yieldToMain();
            }
          }
          controller.enqueue(']');
        }

        controller.enqueue('}');
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

function createGzipByteStream(textStream: ReadableStream<string>): ReadableStream<Uint8Array> {
  return textStream.pipeThrough(new TextEncoderStream()).pipeThrough(new CompressionStream('gzip'));
}

async function writeByteStream(writable: FsWritable, byteStream: ReadableStream<Uint8Array>): Promise<void> {
  if ('getWriter' in writable) {
    await byteStream.pipeTo(writable as unknown as WritableStream<Uint8Array>);
    return;
  }
  const reader = byteStream.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value?.byteLength) {
        const copy = new ArrayBuffer(value.byteLength);
        new Uint8Array(copy).set(value);
        await writable.write(copy);
      }
    }
    await writable.close();
  } finally {
    reader.releaseLock();
  }
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

/** 権限失効時はユーザージェスチャー内から呼び出す必要がある。 */
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

/** C-01: 商品画像を images/ サブフォルダへ差分同期し、旧リビジョンを削除して書き出した件数を返す。 */
export async function syncImagesToFolder(handle: FsDirectoryHandle): Promise<number> {
  if (typeof handle.getDirectoryHandle !== 'function') return 0;
  const imgDir = await handle.getDirectoryHandle('images', { create: true });
  const existing = new Set<string>();
  const byProduct = new Map<string, string[]>();
  for await (const entry of imgDir.values()) {
    if (entry.kind !== 'file') continue;
    existing.add(entry.name);
    const m = entry.name.match(/^(.+)-(\d+)\.\w+$/);
    if (m) {
      const list = byProduct.get(m[1]) ?? [];
      list.push(entry.name);
      byProduct.set(m[1], list);
    }
  }

  let synced = 0;
  const maxKey = await db.productImages.orderBy(':id').lastKey();
  if (typeof maxKey === 'string') {
    let cursor: string | null = null;
    while (true) {
      const batch: ProductImageRow[] =
        cursor === null
          ? await db.productImages.where(':id').belowOrEqual(maxKey).limit(IMAGE_BATCH).toArray()
          : await db.productImages.where(':id').between(cursor, maxKey, false, true).limit(IMAGE_BATCH).toArray();
      if (!batch.length) break;
      cursor = batch[batch.length - 1].productId;
      for (const row of batch) {
        const targetName = `${row.productId}-${row.rev}.${mimeToExt(row.mime)}`;
        if (!existing.has(targetName)) {
          const fh = await imgDir.getFileHandle(targetName, { create: true });
          const wr = await fh.createWritable();
          await wr.write(row.bytes);
          await wr.close();
          synced += 1;
          for (const prevName of byProduct.get(row.productId) ?? []) {
            if (prevName !== targetName) {
              try {
                await imgDir.removeEntry(prevName);
              } catch {
                /* 削除不可でも同期処理は継続する */
              }
            }
          }
        }
      }
      if (batch.length < IMAGE_BATCH || cursor === maxKey) break;
      await yieldToMain();
    }
  }
  return synced;
}

/** フォルダへスナップショット（+ 画像差分）を書き出し、保持数を超えた古いファイルを削除する。 */
export async function writeBackupToFolder(
  handle: FsDirectoryHandle,
  snapshot: Snapshot,
  keep: number,
): Promise<string> {
  const { fileName: name, blob } = await encodeSnapshotBlob(snapshot);
  const fileHandle = await handle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  if (!snapshot.images) await syncImagesToFolder(handle);
  clearDbDirty();

  await pruneOldBackups(handle, keep);
  return name;
}

/** C-06 / C-01: ストリーミング gzip でフォルダへ書き出し、images/ サブフォルダに画像を差分同期する。 */
export async function writeBackupToFolderStreaming(
  handle: FsDirectoryHandle,
  appVersion: string,
  keep: number,
): Promise<string> {
  if (!canStreamGzip()) {
    const snapshot = await createSnapshot(appVersion);
    return writeBackupToFolder(handle, snapshot, keep);
  }
  const createdAt = Date.now();
  const name = snapshotFileName(new Date(createdAt), true);
  const fileHandle = await handle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  const byteStream = createGzipByteStream(createSnapshotTextStream(appVersion, createdAt));
  await writeByteStream(writable, byteStream);
  await syncImagesToFolder(handle);
  clearDbDirty();
  await pruneOldBackups(handle, keep);
  return name;
}

async function pruneOldBackups(handle: FsDirectoryHandle, keep: number): Promise<void> {
  if (keep <= 0) return;
  const files = await listBackupFiles(handle);
  for (const old of files.slice(keep)) {
    try {
      await handle.removeEntry(old.name);
    } catch {
      /* 使用中または既に削除済みのファイルは無視して継続する */
    }
  }
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function downloadSnapshot(snapshot: Snapshot): Promise<void> {
  const { fileName, blob } = await encodeSnapshotBlob(snapshot);
  triggerBlobDownload(blob, fileName);
}

/** C-06 / C-01: 現在のDBをストリーミング形式でファイル出力する（通常は軽量 .json.gz、完全版は画像込み .urito.json）。 */
export async function downloadLiveSnapshot(
  appVersion: string,
  opts?: { includeImages?: boolean },
): Promise<void> {
  const createdAt = Date.now();
  if (opts?.includeImages) {
    const baseName = snapshotFileName(new Date(createdAt), false).replace(/\.json$/, '.urito.json');
    if (typeof TextEncoderStream !== 'undefined' && typeof ReadableStream !== 'undefined') {
      const byteStream = createSnapshotTextStream(appVersion, createdAt, { includeImages: true }).pipeThrough(
        new TextEncoderStream(),
      );
      const blob = await new Response(byteStream, { headers: { 'Content-Type': 'application/json' } }).blob();
      triggerBlobDownload(blob, baseName);
      return;
    }
    const snap = await createSnapshot(appVersion, { includeImages: true });
    triggerBlobDownload(new Blob([JSON.stringify(snap)], { type: 'application/json' }), baseName);
    return;
  }

  if (canStreamGzip()) {
    const fileName = snapshotFileName(new Date(createdAt), true);
    const byteStream = createGzipByteStream(createSnapshotTextStream(appVersion, createdAt));
    const blob = await new Response(byteStream, { headers: { 'Content-Type': 'application/gzip' } }).blob();
    triggerBlobDownload(blob, fileName);
    return;
  }
  const snap = await createSnapshot(appVersion);
  await downloadSnapshot(snap);
}

/* -------------------------------------------------------------- restoring */

export async function decodeSnapshotBuffer(buf: ArrayBuffer): Promise<Snapshot> {
  const u8 = new Uint8Array(buf);
  const isGzip = u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b;
  const text = isGzip ? await gzipDecompressBytes(buf) : new TextDecoder().decode(u8);
  const parsed: unknown = JSON.parse(text);
  return validateSnapshot(parsed);
}

export async function readSnapshotFile(file: File): Promise<Snapshot> {
  return decodeSnapshotBuffer(await file.arrayBuffer());
}

async function prepareUsersForImport(snapshot: Snapshot): Promise<Snapshot> {
  const users = snapshot.data.users;
  if (!Array.isArray(users) || !users.length) return snapshot;
  const converted = await Promise.all(
    users.map(async (u) => {
      if (!isPlainRecord(u)) return u;
      if (typeof u.pin === 'string' && u.pin && !u.pinHash) {
        const { hash, salt } = await hashPin(u.pin);
        return { ...u, pin: '', pinHash: hash, pinSalt: salt };
      }
      return u.pin ? { ...u, pin: '' } : u;
    }),
  );
  return { ...snapshot, data: { ...snapshot.data, users: converted } };
}

function decodeSnapshotImages(images: SnapshotImageRow[] | undefined): ProductImageRow[] {
  if (!images?.length) return [];
  return images.map((img) => ({
    productId: img.productId,
    mime: img.mime || 'image/webp',
    w: Number.isFinite(img.w) ? img.w : 320,
    h: Number.isFinite(img.h) ? img.h : 320,
    rev: Number.isFinite(img.rev) ? img.rev : 1,
    bytes: base64ToArrayBuffer(img.data),
  }));
}

async function readFolderImagesForProducts(
  handle: FsDirectoryHandle | null | undefined,
  products: Product[],
): Promise<ProductImageRow[] | null> {
  if (!handle || typeof handle.getDirectoryHandle !== 'function') return null;
  let imgDir: FsDirectoryHandle;
  try {
    imgDir = await handle.getDirectoryHandle('images', { create: false });
  } catch {
    return null;
  }
  const byName = new Map<string, FsFileHandle>();
  for await (const entry of imgDir.values()) {
    if (entry.kind === 'file') byName.set(entry.name, entry);
  }
  const out: ProductImageRow[] = [];
  for (const p of products) {
    if (!p.imageRev) continue;
    const prefix = `${p.id}-${p.imageRev}.`;
    for (const [name, fh] of byName) {
      if (!name.startsWith(prefix)) continue;
      const file = await fh.getFile();
      out.push({
        productId: p.id,
        mime: file.type || (name.endsWith('.png') ? 'image/png' : name.endsWith('.jpg') ? 'image/jpeg' : 'image/webp'),
        w: 320,
        h: 320,
        rev: p.imageRev,
        bytes: await file.arrayBuffer(),
      });
      break;
    }
  }
  return out;
}

export async function restoreSnapshot(snapshot: Snapshot, folderHandle?: FsDirectoryHandle | null): Promise<void> {
  const valid = await prepareUsersForImport(validateSnapshot(snapshot));
  let restoredImages: ProductImageRow[] | null = valid.images !== undefined ? decodeSnapshotImages(valid.images) : null;
  if (!restoredImages && folderHandle) {
    restoredImages = await readFolderImagesForProducts(
      folderHandle,
      (valid.data.products ?? []) as Product[],
    );
  }
  const tables = BACKUP_TABLES.map(
    (name) => (db as unknown as Record<BackupTable, { clear: () => Promise<void>; bulkPut: (rows: unknown[]) => Promise<unknown> }>)[name],
  );
  await db.transaction('rw', [...tables, db.productImages] as never, async () => {
    for (const name of BACKUP_TABLES) {
      const table = (db as unknown as Record<BackupTable, { clear: () => Promise<void>; bulkPut: (rows: unknown[]) => Promise<unknown> }>)[name];
      await table.clear();
      const rows = valid.data[name];
      if (Array.isArray(rows) && rows.length) await table.bulkPut(rows);
    }
    if (restoredImages !== null) {
      await db.productImages.clear();
      if (restoredImages.length) await db.productImages.bulkPut(restoredImages);
    }
  });
  await rebuildRollups();
}

/* ---------------------------------------------------------- orchestration */

export interface BackupResult {
  ok: boolean;
  fileName?: string;
  error?: string;
}

/** ボタン・定期タイマー・一定伝票数ごとに呼ばれるワンショットバックアップ処理。 */
export async function runBackup(appVersion: string, keep: number): Promise<BackupResult> {
  const handle = await getStoredFolder();
  if (!handle) return { ok: false, error: 'no-folder' };
  const permitted = (await folderPermission(handle)) === 'granted';
  if (!permitted) return { ok: false, error: 'permission' };
  try {
    const fileName = await writeBackupToFolderStreaming(handle, appVersion, keep);
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

/** ネットワーク接続不要な他端末の売上データをローカルDBへ非破壊で統合する（既存データは上書きしない）。 */
export async function mergeSnapshot(snapshot: Snapshot): Promise<MergeResult> {
  const prepared = await prepareUsersForImport(snapshot);
  const incomingImages = decodeSnapshotImages(prepared.images);
  type AnyTable = {
    toCollection: () => { primaryKeys: () => Promise<string[]> };
    bulkAdd: (rows: unknown[]) => Promise<unknown>;
  };
  const tables = db as unknown as Record<BackupTable, AnyTable>;
  const names = BACKUP_TABLES.filter((n) => n !== 'settings');
  const result: MergeResult = { added: {}, stockAdjusted: 0, renamedCodes: 0 };

  await db.transaction('rw', [...names.map((n) => tables[n]), db.productImages] as never, async () => {
    const existingIds = new Map<string, Set<string>>();
    for (const name of names) {
      existingIds.set(name, new Set(await tables[name].toCollection().primaryKeys()));
    }
    const hadProduct = existingIds.get('products')!;
    const hadCustomer = existingIds.get('customers')!;
    const codeKeys = await db.orders.orderBy('code').uniqueKeys();
    const localCodes = new Set(codeKeys.filter((k): k is string => typeof k === 'string' && k !== ''));

    const incoming = <T extends { id: string }>(name: BackupTable): T[] => {
      const rows = (prepared.data[name] ?? []) as T[];
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

        // マージ前から本端末に存在した商品の在庫増減差分を再計算して反映する
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

        // マージ前から本端末に存在する顧客の取引実績（ポイント・累計額）を反映する
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

    if (incomingImages.length) {
      for (const img of incomingImages) {
        const cur = await db.productImages.get(img.productId);
        if (!cur || img.rev > cur.rev) {
          await db.productImages.put(img);
        }
      }
    }
  });

  await rebuildRollups();
  return result;
}

/** モバイル共有シート経由で別端末へ受け渡す（未対応ブラウザはダウンロード）。 */
export async function shareSnapshot(snapshot: Snapshot, title: string): Promise<'shared' | 'downloaded'> {
  const body = JSON.stringify(snapshot);
  // Android 共有シートは拡張子制限があるため .txt として書き出す
  const shareName = snapshotFileName(new Date(snapshot.createdAt), false).replace(/\.json$/, '.txt');
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
  await downloadSnapshot(snapshot);
  return 'downloaded';
}
