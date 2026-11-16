import { db, kvGet, kvSet } from '@/db/db';
import { hashPin } from '@/core/pin';
import { dataUrlToImageBytes } from '@/lib/image';
import type { Product, ProductImageRow } from '@/db/types';

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

/** C-01: 既存の Product.image (DataURL) を20件単位のバッチで productImages テーブルへ分離移送する。 */
export const migrateProductImagesTask: BackgroundTask = {
  id: 'product-images-v4',
  async run() {
    const products = await db.products.toArray();
    const targets = products.filter((p) => Boolean(p.image));
    for (let i = 0; i < targets.length; i += 20) {
      const batch = targets.slice(i, i + 20);
      const imageRows: ProductImageRow[] = [];
      const updatedProducts: Product[] = [];
      for (const p of batch) {
        const decoded = dataUrlToImageBytes(p.image);
        if (decoded) {
          const rev = Math.max(1, p.imageRev ?? 0);
          imageRows.push({ productId: p.id, ...decoded, rev });
          updatedProducts.push({ ...p, image: '', imageRev: rev });
        }
      }
      if (!imageRows.length) continue;
      await db.transaction('rw', [db.products, db.productImages], async () => {
        await db.productImages.bulkPut(imageRows);
        await db.products.bulkPut(updatedProducts);
      });
    }
  },
};

export const BACKGROUND_TASKS: BackgroundTask[] = [migratePlaintextPinsTask, migrateProductImagesTask];

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
