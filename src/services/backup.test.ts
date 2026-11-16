import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearDbDirty, db, isDbDirty, withoutDirtyTracking } from '@/db/db';
import {
  BackupValidationError,
  createSnapshot,
  createSnapshotTextStream,
  decodeSnapshotBuffer,
  encodeSnapshotBlob,
  isGzipSupported,
  mergeSnapshot,
  restoreSnapshot,
  syncImagesToFolder,
  writeBackupToFolderStreaming,
  type FsDirectoryHandle,
  type FsFileHandle,
  type Snapshot,
} from './backup';
import type { Customer, Order, Product, StockMovement } from '@/db/types';

const now = Date.now();

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p1', sku: '', barcode: '', name: 'Coca', categoryId: '', price: 12000, cost: 9000, unit: '',
  trackStock: true, stock: 10, minStock: 0, isService: false, active: true, color: '', image: '',
  modifierGroupIds: [], favorite: false, sort: 0, createdAt: now, updatedAt: now, ...over,
});

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: 'c1', code: 'KH1', name: 'An', phone: '', address: '', note: '', points: 5, debt: 0,
  totalSpent: 0, orderCount: 0, birthday: '', active: true, createdAt: now, updatedAt: now, ...over,
});

const order = (over: Partial<Order> = {}): Order => ({
  id: 'o1', code: 'HD-0001', type: 'retail', status: 'paid', tableId: null, tableName: '', guests: 1,
  customerId: null, customerName: '', items: [], subtotal: 36000, discountType: 'none', discountValue: 0,
  discount: 0, serviceCharge: 0, taxMode: 'none', taxRate: 0, tax: 0, rounding: 0, total: 36000,
  cogs: 27000, paidAmount: 36000, changeAmount: 0, dueAmount: 0, payments: [], refunds: [],
  refundedAmount: 0, pointsEarned: 0, pointsUsed: 0, pointsValue: 0, note: '', userId: '', userName: '',
  shiftId: null, createdAt: now, updatedAt: now, paidAt: now, voidedAt: 0, voidReason: '', ...over,
});

const movement = (over: Partial<StockMovement> = {}): StockMovement => ({
  id: 'm1', productId: 'p1', productName: 'Coca', type: 'sale', qty: -3, before: 10, after: 7,
  cost: 9000, refType: 'order', refId: 'o1', note: '', userId: '', userName: '', at: now, ...over,
});

/** 停電中などに別端末で1件販売した後に生成されたスナップショットを模擬する。 */
async function phoneSnapshotWithOneSale(): Promise<Snapshot> {
  const snap = await createSnapshot('test');
  const clone = JSON.parse(JSON.stringify(snap)) as Snapshot;
  clone.data.orders.push(
    order({ id: 'o-phone', code: 'HD-0001', customerId: 'c1', total: 24000, pointsEarned: 2, dueAmount: 4000 }),
  );
  clone.data.stockMovements.push(movement({ id: 'm-phone', qty: -2, refId: 'o-phone' }));
  clone.data.products.push(product({ id: 'p-new', name: 'Pepsi', stock: 50 }));
  return clone;
}

describe('mergeSnapshot 端末間マージ', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.products.put(product());
    await db.customers.put(customer());
    await db.orders.put(order());
    await db.stockMovements.put(movement());
  });

  it('ローカル端末に存在しないレコードのみを追加する', async () => {
    const result = await mergeSnapshot(await phoneSnapshotWithOneSale());
    expect(result.added.orders).toBe(1);
    expect(result.added.products).toBe(1);
    expect(await db.orders.count()).toBe(2);
    expect(await db.products.count()).toBe(2);
  });

  it('既存商品の在庫数へ別端末での出庫履歴差分を再生する', async () => {
    await mergeSnapshot(await phoneSnapshotWithOneSale());
    expect((await db.products.get('p1'))!.stock).toBe(8); // 別端末で2点販売された分を減算 (10 - 2)
    expect((await db.products.get('p-new'))!.stock).toBe(50); // 新規追加商品はスナップショット値を採用
  });

  it('取り込んだ売上のポイント・累計購入額・売掛金を顧客へ反映する', async () => {
    await mergeSnapshot(await phoneSnapshotWithOneSale());
    const c = (await db.customers.get('c1'))!;
    expect(c.orderCount).toBe(1);
    expect(c.totalSpent).toBe(24000);
    expect(c.points).toBe(7);
    expect(c.debt).toBe(4000);
  });

  it('ローカルと重複する伝票番号にサフィックスを付与して衝突を回避する', async () => {
    const result = await mergeSnapshot(await phoneSnapshotWithOneSale());
    expect(result.renamedCodes).toBe(1);
    expect((await db.orders.get('o-phone'))!.code).toBe('HD-0001-M');
  });

  it('同一スナップショットを2回マージしても結果が変わらない（冪等性）', async () => {
    const snap = await phoneSnapshotWithOneSale();
    await mergeSnapshot(snap);
    const second = await mergeSnapshot(snap);
    expect(second.added.orders).toBe(0);
    expect((await db.products.get('p1'))!.stock).toBe(8);
    expect((await db.customers.get('c1'))!.orderCount).toBe(1);
  });

  it('端末固有の店舗設定(settings)は上書きせず維持する', async () => {
    await db.settings.put({ id: 'app', shopName: 'PC' } as never);
    const snap = await phoneSnapshotWithOneSale();
    snap.data.settings = [{ id: 'app', shopName: 'Phone' }];
    await mergeSnapshot(snap);
    expect((await db.settings.get('app'))!.shopName).toBe('PC');
  });
});

describe('スナップショット復元時のレコード単位バリデーション (B-08)', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.products.put(product());
  });

  it('不正な行を含むスナップショットはテーブル名と行番号付きで拒否し、既存DBデータを削除しない', async () => {
    const snap = await createSnapshot('test');
    const tampered = JSON.parse(JSON.stringify(snap)) as Snapshot;
    tampered.data.products.push({ ...product({ id: 'p-bad' }), price: 'invalid' as unknown as number });

    let caught: unknown = null;
    try {
      await restoreSnapshot(tampered);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(BackupValidationError);
    expect((caught as BackupValidationError).message).toContain('products[1]');
    // 既存のDBデータは一切消えていない
    expect(await db.products.count()).toBe(1);
    expect((await db.products.get('p1'))!.name).toBe('Coca');
  });

  it('新規スナップショットには平文PINが含まれず、旧形式PIN入りバックアップの復元時に自動ハッシュ化される (B-06)', async () => {
    await db.users.put({
      id: 'u-legacy',
      name: 'スタッフA',
      pin: '2580',
      role: 'cashier',
      active: true,
      color: '#0ea5e9',
      createdAt: now,
    });

    const exported = await createSnapshot('test');
    const json = JSON.stringify(exported);
    expect(json).not.toContain('2580');

    // 旧バックアップ（平文 pin を保持）を取り込むと平文は消去され pinHash/pinSalt が設定される
    const legacySnap = JSON.parse(json) as Snapshot;
    legacySnap.data.users = [
      {
        id: 'u-legacy',
        name: 'スタッフA',
        pin: '2580',
        role: 'cashier',
        active: true,
        color: '#0ea5e9',
        createdAt: now,
      },
    ];
    await restoreSnapshot(legacySnap);
    const saved = (await db.users.get('u-legacy'))!;
    expect(saved.pin).toBe('');
    expect(saved.pinHash).toBeTruthy();
    expect(saved.pinSalt).toBeTruthy();
  });
});


describe('Gzip圧縮バックアップと変更検知 (C-06)', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    clearDbDirty();
  });

  it('format:2 スナップショットをgzip圧縮(.json.gz)しマジックバイト判定で復元できる', async () => {
    await db.products.put(product());
    const snap = await createSnapshot('test');
    expect(snap.format).toBe(2);

    const { fileName, blob } = await encodeSnapshotBlob(snap);
    if (isGzipSupported()) {
      expect(fileName.endsWith('.json.gz')).toBe(true);
      const buf = await blob.arrayBuffer();
      const head = new Uint8Array(buf);
      expect(head[0]).toBe(0x1f);
      expect(head[1]).toBe(0x8b);
      const decoded = await decodeSnapshotBuffer(buf);
      expect(decoded.format).toBe(2);
      expect((decoded.data.products[0] as Product).name).toBe('Coca');
    }
  });

  it('旧形式(format:1)の非圧縮JSONファイルも後方互換で読み込める', async () => {
    await db.products.put(product());
    const snap = { ...(await createSnapshot('test')), format: 1 };
    const plain = new TextEncoder().encode(JSON.stringify(snap)).buffer;
    const decoded = await decodeSnapshotBuffer(plain);
    expect(decoded.format).toBe(1);
    expect(decoded.data.products).toHaveLength(1);
  });

  it('テーブル変更でdirtyになり clearDbDirty / withoutDirtyTracking が正しく動作する', async () => {
    expect(isDbDirty()).toBe(false);
    await db.products.put(product());
    expect(isDbDirty()).toBe(true);
    clearDbDirty();
    expect(isDbDirty()).toBe(false);

    await withoutDirtyTracking(async () => {
      await db.settings.put({ id: 'app', shopName: 'Urito' } as never);
    });
    expect(isDbDirty()).toBe(false);
  });

  it('500件超のデータでもストリーミングJSON生成で全件を正しく分割出力できる (C-06)', async () => {
    const bulkProducts = Array.from({ length: 620 }, (_, i) =>
      product({ id: `p-${String(i).padStart(4, '0')}`, name: `商品${i}` }),
    );
    await db.products.bulkPut(bulkProducts);

    const stream = createSnapshotTextStream('test');
    const json = await new Response(stream.pipeThrough(new TextEncoderStream())).text();
    const parsed = JSON.parse(json) as Snapshot;
    expect(parsed.counts.products).toBe(620);
    expect(parsed.data.products).toHaveLength(620);
  });

  it('フォルダバックアップ時に images/ サブフォルダへ差分同期し、画像付き完全復元もできる (C-01)', async () => {
    await db.products.put(product({ id: 'p-img', imageRev: 2 }));
    const rawBytes = new Uint8Array([1, 2, 3, 4]).buffer;
    await db.productImages.put({
      productId: 'p-img',
      mime: 'image/webp',
      w: 320,
      h: 320,
      rev: 2,
      bytes: rawBytes,
    });

    const files = new Map<string, Uint8Array>();
    const makeDir = (prefix: string): FsDirectoryHandle => ({
      kind: 'directory',
      name: prefix || 'root',
      getFileHandle(name) {
        const key = `${prefix}${name}`;
        return Promise.resolve({
          kind: 'file',
          name,
          getFile() {
            const bytes = files.get(key) ?? new Uint8Array();
            return Promise.resolve(
              new File([bytes.slice().buffer], name, {
                type: name.endsWith('.webp') ? 'image/webp' : 'application/gzip',
                lastModified: Date.now(),
              }),
            );
          },
          createWritable() {
            const chunks: Uint8Array[] = [];
            return Promise.resolve({
              async write(data) {
                if (typeof data === 'string') chunks.push(new TextEncoder().encode(data));
                else if (data instanceof Blob) chunks.push(new Uint8Array(await data.arrayBuffer()));
                else if (ArrayBuffer.isView(data)) chunks.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
                else chunks.push(new Uint8Array(data));
              },
              close() {
                const total = chunks.reduce((s, c) => s + c.byteLength, 0);
                const merged = new Uint8Array(total);
                let off = 0;
                for (const c of chunks) {
                  merged.set(c, off);
                  off += c.byteLength;
                }
                files.set(key, merged);
                return Promise.resolve();
              },
            });
          },
        } satisfies FsFileHandle);
      },
      getDirectoryHandle(name) {
        return Promise.resolve(makeDir(`${prefix}${name}/`));
      },
      removeEntry(name) {
        files.delete(`${prefix}${name}`);
        return Promise.resolve();
      },
      async *values() {
        for (const [k] of files) {
          if (!k.startsWith(prefix)) continue;
          const rest = k.slice(prefix.length);
          if (rest.includes('/')) continue;
          yield await this.getFileHandle(rest);
        }
      },
    });

    const root = makeDir('');
    const written = await writeBackupToFolderStreaming(root, 'test', 5);
    expect(written).toBeTruthy();
    expect(files.has('images/p-img-2.webp')).toBe(true);
    // 2回目は既存画像をスキップするため0件
    expect(await syncImagesToFolder(root)).toBe(0);

    // 画像込みシングルファイル経由での復元
    const fullSnap = await createSnapshot('test', { includeImages: true });
    expect(fullSnap.images).toHaveLength(1);
    await db.products.clear();
    await db.productImages.clear();
    await restoreSnapshot(fullSnap);
    const restoredImg = await db.productImages.get('p-img');
    expect(restoredImg?.rev).toBe(2);
    expect(new Uint8Array(restoredImg!.bytes)).toEqual(new Uint8Array([1, 2, 3, 4]));

    // フォルダからの復元 (.json.gz + images/)
    const gzSnap = await createSnapshot('test');
    expect(gzSnap.images).toBeUndefined();
    await db.productImages.clear();
    await restoreSnapshot(gzSnap, root);
    expect((await db.productImages.get('p-img'))?.rev).toBe(2);
  });
});
