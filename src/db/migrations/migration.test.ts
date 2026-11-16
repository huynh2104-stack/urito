import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { db, UritoDB } from '@/db/db';
import { migrateProductImagesTask } from '@/db/migrations/background';
import { LATEST_SCHEMA_VERSION } from '@/db/migrations';
import { v1Migration } from '@/db/migrations/v1';

interface SnapshotFixture {
  data: Record<string, unknown[]>;
}

describe('v1 スナップショットからのスキーママイグレーション', () => {
  it('v1データを最新バージョンへ移行しても件数・伝票合計金額・在庫数が保持される', async () => {
    const raw = readFileSync(join(process.cwd(), 'fixtures', 'v1-snapshot.json'), 'utf8');
    const fixture = JSON.parse(raw) as SnapshotFixture;
    const dbName = `urito-mig-test-${Date.now()}`;

    const legacy = new Dexie(dbName);
    legacy.version(1).stores(v1Migration.stores);
    await legacy.open();
    for (const [tableName, rows] of Object.entries(fixture.data)) {
      if (rows.length) {
        await legacy.table(tableName).bulkPut(rows);
      }
    }
    legacy.close();

    const upgraded = new UritoDB(dbName);
    await upgraded.open();
    expect(upgraded.verno).toBe(LATEST_SCHEMA_VERSION);

    for (const [tableName, rows] of Object.entries(fixture.data)) {
      if (tableName === 'kv') continue;
      expect(await upgraded.table(tableName).count()).toBe(rows.length);
    }

    const expectedOrders = fixture.data.orders as { id: string; total: number }[];
    const actualOrders = await upgraded.orders.toArray();
    expect(actualOrders.reduce((s, o) => s + o.total, 0)).toBe(expectedOrders.reduce((s, o) => s + o.total, 0));

    const expectedProducts = fixture.data.products as { id: string; stock: number }[];
    for (const p of expectedProducts) {
      expect((await upgraded.products.get(p.id))?.stock).toBe(p.stock);
    }

    upgraded.close();
    await Dexie.delete(dbName);
  });

  it('C-01: インラインDataURL画像を productImages テーブルへ移行し product.image を空にする', async () => {
    await db.open();
    await db.products.clear();
    await db.productImages.clear();
    const now = Date.now();
    await db.products.put({
      id: 'p_img_mig',
      sku: 'SKU-IMG',
      barcode: '',
      name: 'テスト画像商品',
      categoryId: '',
      price: 500,
      cost: 200,
      unit: '',
      trackStock: false,
      stock: 0,
      minStock: 0,
      isService: false,
      active: true,
      color: '#111111',
      image: 'data:image/webp;base64,SGVsbG8=',
      modifierGroupIds: [],
      favorite: false,
      sort: 0,
      createdAt: now,
      updatedAt: now,
    });

    await migrateProductImagesTask.run();

    const migratedProduct = await db.products.get('p_img_mig');
    expect(migratedProduct?.image).toBe('');
    expect(migratedProduct?.imageRev).toBe(1);

    const imgRow = await db.productImages.get('p_img_mig');
    expect(imgRow?.mime).toBe('image/webp');
    expect(imgRow?.rev).toBe(1);
    expect(new TextDecoder().decode(imgRow?.bytes)).toBe('Hello');
  });
});
