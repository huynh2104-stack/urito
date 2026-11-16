import { db, kvGet, kvSet } from '@/db/db';

export interface BackgroundTask {
  id: string;
  run: () => Promise<void>;
}

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
