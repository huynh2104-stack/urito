import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings } from './defaults';
import {
  clearDemoScenarioStorage,
  DEMO_DB_NAME,
  DEMO_SESSION_KEY,
  PROD_DB_NAME,
  resolveDbName,
  UritoDB,
} from './db';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => {
      map.delete(k);
    },
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

describe('分離データベースによるデモモード (E-02)', () => {
  const prodDb = new UritoDB(PROD_DB_NAME);
  const demoDb = new UritoDB(DEMO_DB_NAME);

  beforeEach(async () => {
    await prodDb.open();
    await demoDb.open();
    await Promise.all(prodDb.tables.map((t) => t.clear()));
    await Promise.all(demoDb.tables.map((t) => t.clear()));
  });

  it('resolveDbName は URL の ?demo=... と sessionStorage に基づき Dexie 生成前に urito / urito-demo を判定する', () => {
    const store = memoryStorage();
    expect(resolveDbName('', store)).toBe(PROD_DB_NAME);

    // URLに有効なデモパラメータがあれば urito-demo を返し sessionStorage にも記憶する
    expect(resolveDbName('?demo=ja-retail', store)).toBe(DEMO_DB_NAME);
    expect(store.getItem(DEMO_SESSION_KEY)).toBe('ja-retail');
    expect(resolveDbName('?demo=1', memoryStorage())).toBe(DEMO_DB_NAME);

    // リロード等でクエリが消えても sessionStorage により urito-demo を維持する
    expect(resolveDbName('', store)).toBe(DEMO_DB_NAME);

    // 不正値のみ指定された場合は sessionStorage 側の設定なしなら本番DB名
    const freshStore = memoryStorage();
    expect(resolveDbName('?demo=unknown', freshStore)).toBe(PROD_DB_NAME);

    // 終了処理でフラグが消去されると通常DB名に戻る
    clearDemoScenarioStorage(store);
    expect(resolveDbName('', store)).toBe(PROD_DB_NAME);
  });

  it('デモDBでの書き込み・全削除（リセット）を行っても本番 urito DBのデータは一切変更されない', async () => {
    const prodSettings = { ...defaultSettings('vi', 'VND'), shopName: '本番ショップ', onboarded: true };
    await prodDb.settings.put(prodSettings);
    await prodDb.products.put({
      id: 'real-1',
      sku: 'SP0001',
      barcode: '',
      name: '本番商品',
      categoryId: '',
      price: 50000,
      cost: 30000,
      unit: '個',
      trackStock: true,
      stock: 42,
      minStock: 5,
      isService: false,
      active: true,
      color: '#000000',
      image: '',
      modifierGroupIds: [],
      favorite: false,
      sort: 0,
      createdAt: 1,
      updatedAt: 1,
    });

    // デモDBにシードして全クリア（リセット相当）しても本番DBは無傷
    await demoDb.settings.put({ ...defaultSettings('ja', 'JPY'), shopName: 'うりと商店(デモ)', onboarded: true });
    await demoDb.products.put({
      id: 'demo-1',
      sku: 'SKU0001',
      barcode: '',
      name: 'デモ緑茶',
      categoryId: '',
      price: 160,
      cost: 95,
      unit: '本',
      trackStock: true,
      stock: 10,
      minStock: 2,
      isService: false,
      active: true,
      color: '#000000',
      image: '',
      modifierGroupIds: [],
      favorite: false,
      sort: 0,
      createdAt: 1,
      updatedAt: 1,
    });

    await Promise.all(demoDb.tables.map((t) => t.clear()));

    expect(await demoDb.products.count()).toBe(0);
    expect(await demoDb.settings.count()).toBe(0);

    const savedProdSettings = await prodDb.settings.get('app');
    const savedProdProduct = await prodDb.products.get('real-1');
    expect(savedProdSettings?.shopName).toBe('本番ショップ');
    expect(await prodDb.products.count()).toBe(1);
    expect(savedProdProduct?.name).toBe('本番商品');
    expect(savedProdProduct?.stock).toBe(42);
  });
});
