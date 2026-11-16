import { formatCode, newId } from '@/core/id';
import { db } from './db';
import { docPrefixes, PALETTE, defaultOwner, defaultSettings } from './defaults';
import type {
  Area,
  BusinessType,
  Category,
  CurrencyCode,
  Customer,
  DiningTable,
  Lang,
  ModifierGroup,
  Order,
  OrderItem,
  PayMethod,
  Product,
  Settings,
  User,
} from './types';

type Trio = { vi: string; ja: string; en: string };
const t = (vi: string, ja: string, en: string): Trio => ({ vi, ja, en });

interface SeedProduct {
  name: Trio;
  price: number; // in VND, scaled for other currencies
  cost: number;
  cat: number;
  stock?: number;
  mods?: number[];
  fav?: boolean;
}

interface SeedSet {
  categories: Trio[];
  products: SeedProduct[];
  modifiers: { name: Trio; multiple: boolean; required: boolean; options: { name: Trio; delta: number }[] }[];
  areas: Trio[];
  tablesPerArea: number[];
}

const CAFE: SeedSet = {
  categories: [
    t('Cà phê', 'コーヒー', 'Coffee'),
    t('Trà', 'ティー', 'Tea'),
    t('Nước ép & Sinh tố', 'ジュース', 'Juice & Smoothie'),
    t('Bánh ngọt', 'ケーキ', 'Pastry'),
    t('Đồ ăn nhẹ', '軽食', 'Snacks'),
  ],
  modifiers: [
    {
      name: t('Kích cỡ', 'サイズ', 'Size'),
      multiple: false,
      required: true,
      options: [
        { name: t('Nhỏ', 'S', 'Small'), delta: 0 },
        { name: t('Vừa', 'M', 'Medium'), delta: 5000 },
        { name: t('Lớn', 'L', 'Large'), delta: 10000 },
      ],
    },
    {
      name: t('Đá / Đường', '氷・砂糖', 'Ice / Sugar'),
      multiple: true,
      required: false,
      options: [
        { name: t('Ít đá', '氷少なめ', 'Less ice'), delta: 0 },
        { name: t('Không đá', '氷なし', 'No ice'), delta: 0 },
        { name: t('Ít đường', '砂糖少なめ', 'Less sugar'), delta: 0 },
        { name: t('Không đường', '砂糖なし', 'No sugar'), delta: 0 },
      ],
    },
    {
      name: t('Topping', 'トッピング', 'Topping'),
      multiple: true,
      required: false,
      options: [
        { name: t('Trân châu', 'タピオカ', 'Boba'), delta: 8000 },
        { name: t('Thạch', 'ゼリー', 'Jelly'), delta: 8000 },
        { name: t('Kem cheese', 'チーズクリーム', 'Cheese foam'), delta: 10000 },
        { name: t('Shot espresso', 'エスプレッソ追加', 'Extra shot'), delta: 12000 },
      ],
    },
  ],
  products: [
    { name: t('Cà phê đen', 'ブラックコーヒー', 'Black coffee'), price: 25000, cost: 8000, cat: 0, mods: [0, 1], fav: true },
    { name: t('Cà phê sữa', 'ベトナムミルクコーヒー', 'Milk coffee'), price: 30000, cost: 10000, cat: 0, mods: [0, 1], fav: true },
    { name: t('Bạc xỉu', 'バクシウ', 'Bac Xiu'), price: 35000, cost: 12000, cat: 0, mods: [0, 1] },
    { name: t('Cà phê muối', '塩コーヒー', 'Salt coffee'), price: 35000, cost: 12000, cat: 0, mods: [0, 1], fav: true },
    { name: t('Americano', 'アメリカーノ', 'Americano'), price: 40000, cost: 13000, cat: 0, mods: [0, 1] },
    { name: t('Cappuccino', 'カプチーノ', 'Cappuccino'), price: 45000, cost: 16000, cat: 0, mods: [0, 2] },
    { name: t('Latte', 'カフェラテ', 'Latte'), price: 45000, cost: 16000, cat: 0, mods: [0, 2], fav: true },
    { name: t('Trà đào cam sả', '桃レモングラスティー', 'Peach lemongrass tea'), price: 45000, cost: 15000, cat: 1, mods: [0, 1, 2], fav: true },
    { name: t('Trà sữa trân châu', 'タピオカミルクティー', 'Boba milk tea'), price: 40000, cost: 14000, cat: 1, mods: [0, 1, 2], fav: true },
    { name: t('Trà vải', 'ライチティー', 'Lychee tea'), price: 42000, cost: 14000, cat: 1, mods: [0, 1, 2] },
    { name: t('Trà xanh matcha', '抹茶ラテ', 'Matcha latte'), price: 48000, cost: 17000, cat: 1, mods: [0, 2] },
    { name: t('Nước cam ép', 'オレンジジュース', 'Orange juice'), price: 40000, cost: 15000, cat: 2, mods: [0] },
    { name: t('Sinh tố bơ', 'アボカドスムージー', 'Avocado smoothie'), price: 50000, cost: 20000, cat: 2, mods: [0] },
    { name: t('Sinh tố xoài', 'マンゴースムージー', 'Mango smoothie'), price: 48000, cost: 18000, cat: 2, mods: [0] },
    { name: t('Bánh tiramisu', 'ティラミス', 'Tiramisu'), price: 45000, cost: 20000, cat: 3, stock: 20 },
    { name: t('Bánh mousse chanh dây', 'パッションフルーツムース', 'Passionfruit mousse'), price: 45000, cost: 20000, cat: 3, stock: 20 },
    { name: t('Croissant', 'クロワッサン', 'Croissant'), price: 35000, cost: 15000, cat: 3, stock: 30 },
    { name: t('Bánh mì thịt nướng', 'バインミー', 'Banh mi'), price: 35000, cost: 15000, cat: 4, stock: 25 },
    { name: t('Khoai tây chiên', 'フライドポテト', 'French fries'), price: 35000, cost: 12000, cat: 4, stock: 40 },
  ],
  areas: [t('Tầng 1', '1階', 'Ground floor'), t('Tầng 2', '2階', 'First floor'), t('Sân vườn', 'テラス', 'Garden')],
  tablesPerArea: [6, 6, 4],
};

const RETAIL: SeedSet = {
  categories: [
    t('Nước giải khát', '飲料', 'Beverages'),
    t('Bánh kẹo', 'お菓子', 'Snacks & Candy'),
    t('Sữa & Đồ mát', '乳製品', 'Dairy'),
    t('Gia vị & Đồ khô', '調味料・乾物', 'Groceries'),
    t('Hoá mỹ phẩm', '日用品', 'Household'),
  ],
  modifiers: [],
  products: [
    { name: t('Coca Cola lon 330ml', 'コカコーラ 330ml', 'Coca Cola 330ml'), price: 12000, cost: 9000, cat: 0, stock: 120, fav: true },
    { name: t('Pepsi lon 330ml', 'ペプシ 330ml', 'Pepsi 330ml'), price: 12000, cost: 9000, cat: 0, stock: 96 },
    { name: t('Nước suối Lavie 500ml', 'ミネラルウォーター 500ml', 'Mineral water 500ml'), price: 6000, cost: 4000, cat: 0, stock: 200, fav: true },
    { name: t('Trà xanh 0 độ', '緑茶 455ml', 'Green tea 455ml'), price: 12000, cost: 9000, cat: 0, stock: 80 },
    { name: t('Bia Tiger lon', 'タイガービール', 'Tiger beer can'), price: 20000, cost: 16000, cat: 0, stock: 144 },
    { name: t('Bánh Oreo', 'オレオ', 'Oreo'), price: 25000, cost: 19000, cat: 1, stock: 60 },
    { name: t('Snack Oishi', 'スナック菓子', 'Potato snack'), price: 8000, cost: 6000, cat: 1, stock: 100, fav: true },
    { name: t('Kẹo Alpenliebe', 'キャンディ', 'Candy pack'), price: 15000, cost: 11000, cat: 1, stock: 70 },
    { name: t('Bánh Chocopie hộp', 'チョコパイ', 'Chocopie box'), price: 55000, cost: 44000, cat: 1, stock: 30 },
    { name: t('Sữa tươi Vinamilk 1L', '牛乳 1L', 'Fresh milk 1L'), price: 34000, cost: 28000, cat: 2, stock: 40, fav: true },
    { name: t('Sữa chua Vinamilk lốc 4', 'ヨーグルト 4個', 'Yogurt 4-pack'), price: 28000, cost: 22000, cat: 2, stock: 36 },
    { name: t('Phô mai Con Bò Cười', 'チーズ', 'Cheese wedges'), price: 42000, cost: 34000, cat: 2, stock: 24 },
    { name: t('Gạo ST25 5kg', '米 5kg', 'Rice 5kg'), price: 165000, cost: 140000, cat: 3, stock: 20 },
    { name: t('Nước mắm Nam Ngư 500ml', 'ヌクマム 500ml', 'Fish sauce 500ml'), price: 32000, cost: 26000, cat: 3, stock: 45 },
    { name: t('Dầu ăn Simply 1L', 'サラダ油 1L', 'Cooking oil 1L'), price: 58000, cost: 49000, cat: 3, stock: 30 },
    { name: t('Mì Hảo Hảo thùng', 'インスタント麺 箱', 'Instant noodle box'), price: 125000, cost: 108000, cat: 3, stock: 15 },
    { name: t('Nước rửa chén Sunlight', '食器用洗剤', 'Dish soap'), price: 38000, cost: 31000, cat: 4, stock: 40 },
    { name: t('Bột giặt Omo 3kg', '洗濯洗剤 3kg', 'Laundry powder 3kg'), price: 145000, cost: 125000, cat: 4, stock: 18 },
    { name: t('Giấy vệ sinh 10 cuộn', 'トイレットペーパー 10ロール', 'Toilet paper 10 rolls'), price: 62000, cost: 50000, cat: 4, stock: 25 },
    { name: t('Kem đánh răng P/S', '歯磨き粉', 'Toothpaste'), price: 32000, cost: 25000, cat: 4, stock: 50 },
  ],
  areas: [],
  tablesPerArea: [],
};

const RESTAURANT: SeedSet = {
  categories: [
    t('Món khai vị', '前菜', 'Appetisers'),
    t('Món chính', 'メイン', 'Main dishes'),
    t('Cơm & Mì', 'ご飯・麺', 'Rice & Noodles'),
    t('Lẩu & Nướng', '鍋・焼き物', 'Hotpot & Grill'),
    t('Đồ uống', 'ドリンク', 'Drinks'),
  ],
  modifiers: [
    {
      name: t('Khẩu phần', '量', 'Portion'),
      multiple: false,
      required: true,
      options: [
        { name: t('Thường', '普通', 'Regular'), delta: 0 },
        { name: t('Lớn', '大盛り', 'Large'), delta: 20000 },
      ],
    },
    {
      name: t('Yêu cầu thêm', '追加リクエスト', 'Extras'),
      multiple: true,
      required: false,
      options: [
        { name: t('Không hành', 'ネギ抜き', 'No onion'), delta: 0 },
        { name: t('Cay nhiều', '辛口', 'Extra spicy'), delta: 0 },
        { name: t('Thêm rau', '野菜追加', 'Extra vegetables'), delta: 15000 },
        { name: t('Thêm thịt', '肉追加', 'Extra meat'), delta: 30000 },
      ],
    },
  ],
  products: [
    { name: t('Gỏi cuốn tôm thịt', '生春巻き', 'Fresh spring rolls'), price: 55000, cost: 22000, cat: 0, fav: true },
    { name: t('Chả giò', '揚げ春巻き', 'Fried spring rolls'), price: 60000, cost: 24000, cat: 0 },
    { name: t('Salad trộn', 'サラダ', 'Mixed salad'), price: 65000, cost: 25000, cat: 0 },
    { name: t('Súp cua', 'カニスープ', 'Crab soup'), price: 60000, cost: 24000, cat: 0 },
    { name: t('Gà nướng mật ong', 'ハニーローストチキン', 'Honey grilled chicken'), price: 185000, cost: 80000, cat: 1, mods: [0, 1], fav: true },
    { name: t('Cá lóc kho tộ', '魚の煮付け', 'Braised fish'), price: 165000, cost: 70000, cat: 1, mods: [1] },
    { name: t('Sườn xào chua ngọt', '酢豚', 'Sweet & sour ribs'), price: 155000, cost: 65000, cat: 1, mods: [0, 1] },
    { name: t('Tôm rang me', 'エビのタマリンド炒め', 'Tamarind prawns'), price: 195000, cost: 90000, cat: 1, mods: [1] },
    { name: t('Rau muống xào tỏi', '空芯菜炒め', 'Garlic morning glory'), price: 65000, cost: 20000, cat: 1 },
    { name: t('Cơm chiên hải sản', 'シーフードチャーハン', 'Seafood fried rice'), price: 95000, cost: 38000, cat: 2, mods: [0, 1], fav: true },
    { name: t('Cơm trắng', 'ライス', 'Steamed rice'), price: 15000, cost: 5000, cat: 2 },
    { name: t('Phở bò', 'フォー', 'Beef pho'), price: 75000, cost: 30000, cat: 2, mods: [0, 1], fav: true },
    { name: t('Mì xào bò', '牛肉焼きそば', 'Beef fried noodles'), price: 85000, cost: 35000, cat: 2, mods: [0, 1] },
    { name: t('Lẩu thái hải sản', 'シーフードトムヤム鍋', 'Seafood tom yum hotpot'), price: 320000, cost: 140000, cat: 3, mods: [1], fav: true },
    { name: t('Lẩu gà lá é', '鶏鍋', 'Chicken hotpot'), price: 290000, cost: 120000, cat: 3, mods: [1] },
    { name: t('Ba chỉ nướng', '豚バラ焼き', 'Grilled pork belly'), price: 145000, cost: 60000, cat: 3, mods: [0] },
    { name: t('Bia Sài Gòn', 'サイゴンビール', 'Saigon beer'), price: 25000, cost: 17000, cat: 4, stock: 200 },
    { name: t('Nước ngọt', 'ソフトドリンク', 'Soft drink'), price: 20000, cost: 12000, cat: 4, stock: 150 },
    { name: t('Nước suối', 'ミネラルウォーター', 'Water'), price: 15000, cost: 6000, cat: 4, stock: 200 },
    { name: t('Trà đá', '氷茶', 'Iced tea'), price: 5000, cost: 1000, cat: 4 },
  ],
  areas: [t('Khu A', 'Aエリア', 'Zone A'), t('Khu B', 'Bエリア', 'Zone B'), t('Phòng VIP', 'VIPルーム', 'VIP room')],
  tablesPerArea: [8, 8, 4],
};

const SETS: Record<BusinessType, SeedSet> = { cafe: CAFE, retail: RETAIL, restaurant: RESTAURANT };

/** Sample prices are authored in VND; scale them for other currencies. */
function scalePrice(vnd: number, currency: CurrencyCode): number {
  if (currency === 'VND') return vnd;
  if (currency === 'JPY') return Math.round(vnd / 170 / 10) * 10;
  return Math.round(vnd / 25); // USD cents
}

export interface SeedOptions {
  businessType: BusinessType;
  lang: Lang;
  currency: CurrencyCode;
  shopName: string;
  ownerName: string;
  withSampleData: boolean;
  /** Also write ~14 days of paid orders so Dashboard and Reports have figures. */
  withSampleHistory?: boolean;
}

/** Creates settings + owner, and optionally a full demo catalogue. */
export async function seedWorkspace(opts: SeedOptions): Promise<Settings> {
  const set = SETS[opts.businessType];
  const settings: Settings = {
    ...defaultSettings(opts.lang, opts.currency),
    shopName: opts.shopName,
    businessType: opts.businessType,
    orderPrefix: docPrefixes(opts.lang).order[opts.businessType],
    serviceChargeRate: opts.businessType === 'restaurant' ? 0 : 0,
    onboarded: true,
  };
  const owner = defaultOwner(opts.ownerName || 'Admin');

  await db.transaction(
    'rw',
    [
      db.settings,
      db.users,
      db.categories,
      db.modifierGroups,
      db.products,
      db.areas,
      db.diningTables,
      db.customers,
      db.orders,
    ],
    async () => {
      await db.settings.put(settings);
      await db.users.put(owner);
      if (!opts.withSampleData) return;

      const cats: Category[] = set.categories.map((c, i) => ({
        id: newId('c'),
        name: c[opts.lang],
        color: PALETTE[i % PALETTE.length],
        sort: i,
        active: true,
      }));
      await db.categories.bulkPut(cats);

      const mods: ModifierGroup[] = set.modifiers.map((m, i) => ({
        id: newId('m'),
        name: m.name[opts.lang],
        required: m.required,
        multiple: m.multiple,
        sort: i,
        options: m.options.map((o) => ({
          id: newId('o'),
          name: o.name[opts.lang],
          priceDelta: scalePrice(o.delta, opts.currency),
        })),
      }));
      if (mods.length) await db.modifierGroups.bulkPut(mods);

      const now = Date.now();
      const products: Product[] = set.products.map((p, i) => ({
        id: newId('p'),
        sku: `SP${String(i + 1).padStart(4, '0')}`,
        barcode: '',
        name: p.name[opts.lang],
        categoryId: cats[p.cat]?.id ?? '',
        price: scalePrice(p.price, opts.currency),
        cost: scalePrice(p.cost, opts.currency),
        unit: '',
        trackStock: p.stock !== undefined,
        stock: p.stock ?? 0,
        minStock: p.stock !== undefined ? Math.max(5, Math.round(p.stock * 0.15)) : 0,
        isService: false,
        active: true,
        color: PALETTE[p.cat % PALETTE.length],
        image: '',
        modifierGroupIds: (p.mods ?? []).map((mi) => mods[mi]?.id).filter((id): id is string => Boolean(id)),
        favorite: !!p.fav,
        sort: i,
        createdAt: now,
        updatedAt: now,
      }));
      await db.products.bulkPut(products);

      if (set.areas.length) {
        const areas: Area[] = set.areas.map((a, i) => ({ id: newId('a'), name: a[opts.lang], sort: i }));
        await db.areas.bulkPut(areas);
        const tables: DiningTable[] = [];
        areas.forEach((area, ai) => {
          const count = set.tablesPerArea[ai] ?? 4;
          for (let i = 1; i <= count; i++) {
            tables.push({
              id: newId('t'),
              areaId: area.id,
              name: `${opts.lang === 'ja' ? '' : ''}${String.fromCharCode(65 + ai)}${i}`,
              seats: 4,
              sort: i,
            });
          }
        });
        await db.diningTables.bulkPut(tables);
      }

      const walkIn: Customer = {
        id: newId('cu'),
        code: `${docPrefixes(opts.lang).customer}0001`,
        name: opts.lang === 'ja' ? '常連のお客様' : opts.lang === 'vi' ? 'Khách quen' : 'Regular customer',
        phone: '',
        address: '',
        note: '',
        points: 0,
        debt: 0,
        totalSpent: 0,
        orderCount: 0,
        birthday: '',
        active: true,
        createdAt: now,
        updatedAt: now,
      };
      await db.customers.put(walkIn);

      if (opts.withSampleHistory) {
        const orders = buildSampleOrders(products, owner, settings, opts.businessType);
        await db.orders.bulkPut(orders);
        await db.settings.put({ ...settings, nextOrderNo: orders.length + 1, updatedAt: Date.now() });
      }
    },
  );

  return settings;
}

/** Reads settings, creating a blank not-yet-onboarded record on first launch. */
export async function loadOrInitSettings(): Promise<Settings> {
  const existing = await db.settings.get('app');
  if (existing) return existing;
  const fresh = defaultSettings();
  await db.settings.put(fresh);
  return fresh;
}

/* ------------------------------------------------------------ sample history */

/** Small deterministic PRNG so the demo looks the same every time. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Roughly two weeks of paid, walk-in sales: busier at weekends, lunch and
 *  evening peaks, mostly cash. Written straight to the table (no stock
 *  movement) because it only exists to make a trial shop look lived-in. */
function buildSampleOrders(
  products: Product[],
  owner: User,
  settings: Settings,
  businessType: BusinessType,
): Order[] {
  const sellable = products.filter((p) => p.active && !p.isService);
  if (!sellable.length) return [];

  const rand = mulberry32(20260929);
  const pick = <T,>(list: T[]): T => list[Math.floor(rand() * list.length)];
  // Cheap items sell more often: weight by inverse price.
  const weighted = sellable.flatMap((p) => {
    const w = p.favorite ? 4 : 2;
    return Array.from({ length: w }, () => p);
  });

  const hours = businessType === 'retail' ? [7, 8, 9, 11, 12, 15, 16, 17, 18, 19, 20] : [8, 9, 10, 12, 13, 15, 17, 18, 19, 20];
  const methods: PayMethod[] = ['cash', 'cash', 'cash', 'cash', 'transfer', 'qr'];
  const now = Date.now();
  const out: Order[] = [];
  let seq = 1;

  for (let back = 13; back >= 0; back--) {
    const day = new Date(now);
    day.setDate(day.getDate() - back);
    day.setHours(0, 0, 0, 0);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    let count = 7 + Math.floor(rand() * 8) + (weekend ? 5 : 0);
    if (back === 0) count = 5 + Math.floor(rand() * 4);

    const stamps: number[] = [];
    for (let i = 0; i < count; i++) {
      const at = new Date(day);
      at.setHours(pick(hours), Math.floor(rand() * 60), Math.floor(rand() * 60), 0);
      if (at.getTime() < now - 60_000) stamps.push(at.getTime());
    }
    stamps.sort((a, b) => a - b);

    for (const at of stamps) {
      const lines = 1 + Math.floor(rand() * 3);
      const chosen = new Map<string, OrderItem>();
      for (let l = 0; l < lines; l++) {
        const p = pick(weighted);
        const qty = 1 + Math.floor(rand() * (p.price < scalePrice(30000, settings.currency) ? 3 : 2));
        const prev = chosen.get(p.id);
        const nextQty = (prev?.qty ?? 0) + qty;
        chosen.set(p.id, {
          id: newId('oi'),
          productId: p.id,
          name: p.name,
          unit: p.unit,
          price: p.price,
          cost: p.cost,
          qty: nextQty,
          modifiers: [],
          discountType: 'none',
          discountValue: 0,
          note: '',
          gross: p.price * nextQty,
          discount: 0,
          total: p.price * nextQty,
          refundedQty: 0,
        });
      }
      const items = [...chosen.values()];
      const subtotal = items.reduce((sum, i) => sum + i.total, 0);
      const cogs = items.reduce((sum, i) => sum + i.cost * i.qty, 0);
      const method = pick(methods);
      const step = settings.roundTo > 1 ? settings.roundTo : 1;
      const total = step > 1 ? Math.round(subtotal / step) * step : subtotal;
      const tendered = method === 'cash' && step > 1 ? Math.ceil(total / (step * 10)) * (step * 10) : total;

      out.push({
        id: newId('o'),
        code: formatCode(settings.orderPrefix, seq++, new Date(at)),
        type: 'retail',
        status: 'paid',
        tableId: null,
        tableName: '',
        guests: 0,
        customerId: null,
        customerName: '',
        items,
        subtotal,
        discountType: 'none',
        discountValue: 0,
        discount: 0,
        serviceCharge: 0,
        taxMode: 'none',
        taxRate: 0,
        tax: 0,
        rounding: total - subtotal,
        total,
        cogs,
        paidAmount: tendered,
        changeAmount: tendered - total,
        dueAmount: 0,
        payments: [{ id: newId('pay'), method, amount: tendered, ref: '', at }],
        refunds: [],
        refundedAmount: 0,
        pointsEarned: 0,
        pointsUsed: 0,
        pointsValue: 0,
        note: '',
        userId: owner.id,
        userName: owner.name,
        shiftId: null,
        createdAt: at,
        updatedAt: at,
        paidAt: at,
        voidedAt: 0,
        voidReason: '',
      });
    }
  }
  return out;
}
