import Dexie from 'dexie';

const PRE_UPGRADE_DIR = 'pre-upgrade';
const MAX_KEEP = 2;

export interface PreUpgradeBackupInfo {
  name: string;
  size: number;
  lastModified: number;
}

async function getPreUpgradeDir(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return null;
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(PRE_UPGRADE_DIR, { create });
  } catch {
    return null;
  }
}

async function gzipBytes(text: string): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/** スキーマ更新前に既存 IndexedDB の全テーブルを OPFS へ gzip 圧縮保存する。
 *  upgrade トランザクション内では OPFS を呼べないため、新バージョンを開く前に実行する。 */
export async function runPreUpgradeBackupIfNeeded(dbName: string, targetVersion: number): Promise<string | null> {
  if (typeof indexedDB === 'undefined') return null;
  let probe: Dexie | null = null;
  try {
    const exists = await Dexie.exists(dbName);
    if (!exists) return null;

    probe = new Dexie(dbName);
    await probe.open();
    const currentVersion = probe.verno;
    if (currentVersion <= 0 || currentVersion >= targetVersion) {
      return null;
    }

    const dir = await getPreUpgradeDir(true);
    if (!dir) {
      console.warn('[urito] OPFS が利用できないためアップグレード前バックアップをスキップします');
      return null;
    }

    const data: Record<string, unknown[]> = {};
    for (const table of probe.tables) {
      data[table.name] = await table.toArray();
    }

    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const hms = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const fileName = `pre-upgrade-v${currentVersion}-${ymd}-${hms}.json.gz`;

    const payload = JSON.stringify({
      app: 'urito',
      format: 1,
      schemaVersion: currentVersion,
      createdAt: now.getTime(),
      data,
    });
    const gz = await gzipBytes(payload);
    if (!gz) return null;

    const fh = await dir.getFileHandle(fileName, { create: true });
    const writable = await fh.createWritable();
    await writable.write(new Blob([gz.buffer as ArrayBuffer], { type: 'application/gzip' }));
    await writable.close();

    // 直近2件のみ保持し、古いバックアップを削除する
    const entries = await listPreUpgradeBackups();
    for (const old of entries.slice(MAX_KEEP)) {
      try {
        await dir.removeEntry(old.name);
      } catch {
        /* 削除失敗は無視してアップグレードを続行する */
      }
    }

    return fileName;
  } catch (err) {
    console.warn('[urito] アップグレード前バックアップに失敗しました', err);
    return null;
  } finally {
    probe?.close();
  }
}

export async function listPreUpgradeBackups(): Promise<PreUpgradeBackupInfo[]> {
  const dir = await getPreUpgradeDir(false);
  if (!dir) return [];
  const list: PreUpgradeBackupInfo[] = [];
  const entries = (dir as unknown as { values: () => AsyncIterable<FileSystemHandle> }).values();
  for await (const entry of entries) {
    if (entry.kind !== 'file' || !entry.name.startsWith('pre-upgrade-')) continue;
    const file = await (entry as FileSystemFileHandle).getFile();
    list.push({ name: entry.name, size: file.size, lastModified: file.lastModified });
  }
  return list.sort((a, b) => b.lastModified - a.lastModified || b.name.localeCompare(a.name));
}

export async function downloadPreUpgradeBackup(name: string): Promise<boolean> {
  const dir = await getPreUpgradeDir(false);
  if (!dir) return false;
  try {
    const fh = await dir.getFileHandle(name);
    const file = await fh.getFile();
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}
