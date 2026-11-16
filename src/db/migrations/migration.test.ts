import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UritoDB } from '@/db/db';
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
});
