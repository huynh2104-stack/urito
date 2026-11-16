/** A-04: Playwright ベンチマーク専用の遅延ロード計測ハーネス（`?bench=1` 付与時のみ読込）。 */
import { db, withoutDirtyTracking } from '@/db/db';
import { defaultOwner, defaultSettings, pickColor } from '@/db/defaults';
import type { Category, Order, Product, ProductImageRow, Shift } from '@/db/types';
import { createSnapshotTextStream } from '@/services/backup';
import { rebuildRollups, yieldToMain } from '@/services/rollups';
import { useApp } from '@/store/app';

let imageGetCount = 0;

function installImageReadCounter(): void {
  const table = db.productImages;
  const origGet = table.get.bind(table);
  (table as unknown as { get: (key: string) => Promise<ProductImageRow | undefined> }).get = (key: string) => {
    imageGetCount += 1;
    return origGet(key);
  };
}

installImageReadCounter();

async function makeSampleWebpBytes(): Promise<ArrayBuffer> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(64, 64);
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#2947d4';
      ctx.fillRect(0, 0, 64, 64);
    }
    const blob = await c.convertToBlob({ type: 'image/webp', quality: 0.75 });
    return blob.arrayBuffer();
  }
  return new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x50, 0x56]).buffer;
}

export interface BenchSeedOpts {
  productCount: number;
  orderCount: number;
  withImages?: boolean;
}

export async function seedBenchScale(opts: BenchSeedOpts): Promise<{ ms: number }> {
  const t0 = performance.now();
  const { productCount, orderCount, withImages = true } = opts;
  const now = Date.now();

  await withoutDirtyTracking(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));

    const settings = {
      ...defaultSettings('ja', 'JPY'),
      shopName: 'Urito ベンチ検証店',
      onboarded: true,
      requireLogin: false,
      taxMode: 'inclusive' as const,
      taxCode: 'T1234567890123',
      updatedAt: now,
    };
    const owner = { ...defaultOwner('ベンチ店主'), id: 'u-bench' };
    const shift: Shift = {
      id: 'shf-bench',
      code: 'SHF-BENCH',
      userId: owner.id,
      userName: owner.name,
      openedAt: now - 3_600_000,
      closedAt: 0,
      openingCash: 30_000,
      cashIn: 0,
      cashOut: 0,
      cashSales: 0,
      nonCashSales: 0,
      refundTotal: 0,
      expectedCash: 30_000,
      countedCash: 0,
      difference: 0,
      orderCount: 0,
      totalSales: 0,
      note: '',
      status: 'open',
    };

    const categories: Category[] = Array.from({ length: 8 }, (_, i) => ({
      id: `cat-${i}`,
      name: `分類${i + 1}`,
      color: pickColor(i),
      sort: i,
      active: true,
    }));

    await db.settings.put(settings);
    await db.users.put(owner);
    await db.shifts.put(shift);
    await db.categories.bulkPut(categories);

    const sampleBytes = withImages ? await makeSampleWebpBytes() : null;
    const prodBatch: Product[] = [];
    const imgBatch: ProductImageRow[] = [];

    for (let i = 0; i < productCount; i++) {
      const id = `bp-${String(i).padStart(5, '0')}`;
      const price = 150 + (i % 20) * 50;
      const prod: Product = {
        id,
        sku: `BN-${String(i + 1).padStart(5, '0')}`,
        barcode: `2000000${String(i + 1).padStart(5, '0')}${i % 10}`,
        name: i === 0 ? '宇治抹茶ラテ特選' : `検証商品${String(i + 1).padStart(4, '0')}`,
        kana: i === 0 ? 'うじまっちゃらてとくせん' : `けんしょうしょうひん${i + 1}`,
        categoryId: categories[i % categories.length].id,
        price,
        cost: Math.round(price * 0.55),
        unit: '個',
        trackStock: true,
        stock: 999,
        minStock: 10,
        isService: false,
        active: true,
        color: pickColor(i),
        image: '',
        imageRev: withImages ? 1 : 0,
        modifierGroupIds: [],
        favorite: i < 24,
        taxCategory: i % 3 === 0 ? 'reduced' : 'standard',
        sort: i,
        createdAt: now - (productCount - i),
        updatedAt: now,
      };
      prodBatch.push(prod);
      if (sampleBytes) {
        imgBatch.push({
          productId: id,
          mime: 'image/webp',
          w: 64,
          h: 64,
          rev: 1,
          bytes: sampleBytes.slice(0),
        });
      }
      if (prodBatch.length >= 500) {
        await db.products.bulkPut(prodBatch.splice(0));
        if (imgBatch.length) await db.productImages.bulkPut(imgBatch.splice(0));
        await yieldToMain();
      }
    }
    if (prodBatch.length) await db.products.bulkPut(prodBatch);
    if (imgBatch.length) await db.productImages.bulkPut(imgBatch);

    const dayMs = 86_400_000;
    const orderBatch: Order[] = [];
    for (let i = 0; i < orderCount; i++) {
      const ageDays = i % 360;
      const ts = now - ageDays * dayMs - (i % 30_000) * 10;
      const pIdx = i % Math.min(productCount, 200);
      const pid = `bp-${String(pIdx).padStart(5, '0')}`;
      const price = 150 + (pIdx % 20) * 50;
      const qty = (i % 3) + 1;
      const total = price * qty;
      const cogs = Math.round(price * 0.55) * qty;
      orderBatch.push({
        id: `bo-${String(i).padStart(6, '0')}`,
        code: `ORD-B-${String(i + 1).padStart(6, '0')}`,
        type: 'takeaway',
        status: 'paid',
        tableId: null,
        tableName: '',
        guests: 1,
        customerId: null,
        customerName: '',
        items: [
          {
            id: `boi-${i}`,
            productId: pid,
            name: `検証商品${String(pIdx + 1).padStart(4, '0')}`,
            unit: '個',
            price,
            cost: Math.round(price * 0.55),
            qty,
            modifiers: [],
            discountType: 'none',
            discountValue: 0,
            note: '',
            gross: total,
            discount: 0,
            total,
            refundedQty: 0,
            taxCategory: pIdx % 3 === 0 ? 'reduced' : 'standard',
            taxRateBp: pIdx % 3 === 0 ? 800 : 1000,
          },
        ],
        subtotal: total,
        discountType: 'none',
        discountValue: 0,
        discount: 0,
        serviceCharge: 0,
        taxMode: 'inclusive',
        taxRate: 10,
        tax: Math.floor((total * 10) / 110),
        taxLines: [
          {
            rateBp: pIdx % 3 === 0 ? 800 : 1000,
            gross: total,
            net: total - Math.floor((total * 10) / 110),
            tax: Math.floor((total * 10) / 110),
          },
        ],
        rounding: 0,
        total,
        cogs,
        paidAmount: total,
        changeAmount: 0,
        dueAmount: 0,
        payments: [{ id: `bpm-${i}`, method: i % 4 === 0 ? 'card' : 'cash', amount: total, ref: '', at: ts }],
        refunds: [],
        refundedAmount: 0,
        pointsEarned: 0,
        pointsUsed: 0,
        pointsValue: 0,
        note: '',
        userId: owner.id,
        userName: owner.name,
        shiftId: shift.id,
        createdAt: ts,
        updatedAt: ts,
        paidAt: ts,
        voidedAt: 0,
        voidReason: '',
        channel: i % 10 === 0 ? 'shopify' : 'pos',
      });
      if (orderBatch.length >= 2000) {
        await db.orders.bulkPut(orderBatch.splice(0));
        await yieldToMain();
      }
    }
    if (orderBatch.length) await db.orders.bulkPut(orderBatch);
  });

  await rebuildRollups();
  await useApp.getState().init();
  return { ms: Math.round(performance.now() - t0) };
}

export async function measureStreamingBackup(): Promise<{ ms: number; bytes: number }> {
  const t0 = performance.now();
  const stream = createSnapshotTextStream('bench')
    .pipeThrough(new TextEncoderStream())
    .pipeThrough(new CompressionStream('gzip'));
  const reader = stream.getReader();
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
  }
  return { ms: Math.round(performance.now() - t0), bytes };
}

const api = {
  seedBenchScale,
  measureStreamingBackup,
  resetImageReads: () => {
    imageGetCount = 0;
  },
  getImageReads: () => imageGetCount,
};

(window as unknown as { __URITO_BENCH__: typeof api }).__URITO_BENCH__ = api;
