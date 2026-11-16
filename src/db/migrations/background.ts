import { db, kvGet, kvSet } from '@/db/db';
import { hashPin } from '@/core/pin';

export interface BackgroundTask {
  id: string;
  run: () => Promise<void>;
}

/** B-06: 既存の平文 PIN を PBKDF2-SHA256 ハッシュへ変換し、平文を消去するバックグラウンド移行。 */
export const migratePlaintextPinsTask: BackgroundTask = {
  id: 'pin-hash-v1',
  async run() {
    const users = await db.users.toArray();
    const targets = users.filter((u) => u.pin && !u.pinHash);
    if (!targets.length) return;
    // Web Crypto API の非同期呼び出しは Dexie トランザクション外で行う
    const updated = await Promise.all(
      targets.map(async (u) => {
        const { hash, salt } = await hashPin(u.pin);
        return { ...u, pin: '', pinHash: hash, pinSalt: salt };
      }),
    );
    await db.transaction('rw', db.users, async () => {
      await db.users.bulkPut(updated);
    });
  },
};

export const BACKGROUND_TASKS: BackgroundTask[] = [migratePlaintextPinsTask];

/** IndexedDB 以外の非同期 API（暗号化・Canvas 変換など）を伴う移行を、
 *  DB オープン後に少量ずつ冪等に実行するランナー。 */
export async function runBackgroundMigrations(tasks: BackgroundTask[]): Promise<void> {
  for (const task of tasks) {
    const key = `bg.migration.${task.id}`;
    if (await kvGet<boolean>(key)) continue;
    await task.run();
    await kvSet(key, true);
  }
}

export async function isBackgroundMigrationDone(id: string): Promise<boolean> {
  return Boolean(await kvGet<boolean>(`bg.migration.${id}`));
}

export { db };
