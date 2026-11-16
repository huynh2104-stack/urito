import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, kvGet } from '@/db/db';
import { defaultSettings } from '@/db/defaults';
import {
  EC_PENDING_KV,
  importEcOrders,
  parseEcOrdersCsv,
  resolvePendingEcMapping,
  type PendingEcMapping,
} from './ecImport';

const SAMPLE_ORDERS_CSV = [
  'Name,Paid at,Financial Status,Billing Name,Lineitem quantity,Lineitem name,Lineitem price,Lineitem sku,Taxes,Discount Amount,Total',
  '#1001,2026-11-15T10:30:00+09:00,paid,田中 太郎,2,緑茶 500ml,130,R-0002,20,0,260',
  '#1001,2026-11-15T10:30:00+09:00,paid,田中 太郎,1,限定マグカップ,1500,UNKNOWN-99,,,',
  '#1002,2026-11-15T14:00:00+09:00,paid,鈴木 花子,3,緑茶 500ml,130,R-0002,30,0,390',
  '#1003,2026-11-15T15:00:00+09:00,voided,取消顧客,1,緑茶 500ml,130,R-0002,0,0,130',
].join('\n');

describe('EC受注CSVインポートと冪等性・在庫連動 (F-03)', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    const settings = defaultSettings('ja', 'JPY');
    await db.settings.put(settings);
    await db.products.put({
      id: 'p_tea',
      sku: 'R-0002',
      barcode: '4900000000023',
      name: '緑茶 500ml',
      categoryId: '',
      price: 130,
      cost: 75,
      unit: '本',
      trackStock: true,
      stock: 50,
      minStock: 5,
      isService: false,
      active: true,
      color: '#16a34a',
      image: '',
      modifierGroupIds: [],
      favorite: false,
      taxCategory: 'reduced',
      sort: 0,
      createdAt: 1,
      updatedAt: 1,
    });
  });

  it('Shopify互換受注CSVを取り込み・重複取込をスキップし、在庫とチャネル別集計を更新する', async () => {
    const settings = (await db.settings.get('app'))!;
    const parsed = parseEcOrdersCsv(SAMPLE_ORDERS_CSV, { currency: 'JPY' });

    // voided 行は除外され 2注文のみパースされる
    expect(parsed).toHaveLength(2);

    const first = await importEcOrders(parsed, { user: null, settings });
    expect(first.imported).toBe(2);
    expect(first.skippedDuplicates).toBe(0);
    expect(first.unresolvedSkus).toEqual(['UNKNOWN-99']);

    // 在庫は 50 - (2 + 3) = 45 に減算されている
    const tea = await db.products.get('p_tea');
    expect(tea?.stock).toBe(45);

    // 同じCSVを再取込しても冪等（重複スキップされ在庫二重減算されない）
    const second = await importEcOrders(parsed, { user: null, settings });
    expect(second.imported).toBe(0);
    expect(second.skippedDuplicates).toBe(2);
    expect((await db.products.get('p_tea'))?.stock).toBe(45);

    // チャネル別の日次集計テーブルに shopify チャネルとして記録されている
    const stats = await db.dailyStats.toArray();
    expect(stats).toHaveLength(1);
    expect(stats[0].byChannel.shopify).toEqual({ value: 650, count: 2 });

    // F-03: refType:'ec' の在庫移動および未一致明細の紐付け待ちキューを検証する
    const moves = await db.stockMovements.where('productId').equals('p_tea').toArray();
    expect(moves.length).toBe(2);
    expect(moves.every((m) => m.refType === 'ec')).toBe(true);

    const pending = (await kvGet<PendingEcMapping[]>(EC_PENDING_KV)) ?? [];
    expect(pending).toHaveLength(1);
    expect(pending[0].sku).toBe('UNKNOWN-99');

    // 未一致だった明細を手動紐付けすると在庫引当され、次回CSV取込でも学習済みとなる
    await db.products.put({
      id: 'p_mug',
      sku: 'MUG-01',
      barcode: '4900000000099',
      name: '限定マグカップ',
      categoryId: '',
      price: 1500,
      cost: 800,
      unit: '個',
      trackStock: true,
      stock: 10,
      minStock: 2,
      isService: false,
      active: true,
      color: '#2563eb',
      image: '',
      modifierGroupIds: [],
      favorite: false,
      taxCategory: 'standard',
      sort: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    const resolved = await resolvePendingEcMapping(pending[0].id, 'p_mug', null);
    expect(resolved).toBe(1);
    expect((await db.products.get('p_mug'))?.stock).toBe(9);
    expect((await kvGet<PendingEcMapping[]>(EC_PENDING_KV)) ?? []).toHaveLength(0);

    // バーコード一致フォールバックと学習済みSKUによる自動引当
    const extraCsv = [
      'Name,Paid at,Financial Status,Lineitem quantity,Lineitem name,Lineitem price,Lineitem sku',
      '#1004,2026-11-16T09:00:00+09:00,paid,2,新商品,200,4900000000023',
      '#1005,2026-11-16T09:30:00+09:00,paid,1,マグ再注文,1500,UNKNOWN-99',
    ].join('\n');
    const res2 = await importEcOrders(parseEcOrdersCsv(extraCsv, { currency: 'JPY' }), { user: null, settings });
    expect(res2.imported).toBe(2);
    expect(res2.unresolvedSkus).toEqual([]);
    expect((await db.products.get('p_tea'))?.stock).toBe(43);
    expect((await db.products.get('p_mug'))?.stock).toBe(8);
  });
});
