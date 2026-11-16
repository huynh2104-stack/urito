import Dexie, { type Table } from 'dexie';
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from './migrations';
import { runPreUpgradeBackupIfNeeded } from './preUpgrade';
import type {
  Area,
  CashMovement,
  Category,
  Customer,
  DiningTable,
  Expense,
  KV,
  ModifierGroup,
  Order,
  Product,
  Promotion,
  Purchase,
  Settings,
  Shift,
  StockMovement,
  Supplier,
  User,
} from './types';

/** すべてのデータはブラウザの IndexedDB に保存する（サーバー不要・運用費ゼロ）。 */
export class UritoDB extends Dexie {
  settings!: Table<Settings, string>;
  users!: Table<User, string>;
  categories!: Table<Category, string>;
  modifierGroups!: Table<ModifierGroup, string>;
  products!: Table<Product, string>;
  customers!: Table<Customer, string>;
  suppliers!: Table<Supplier, string>;
  areas!: Table<Area, string>;
  diningTables!: Table<DiningTable, string>;
  orders!: Table<Order, string>;
  stockMovements!: Table<StockMovement, string>;
  purchases!: Table<Purchase, string>;
  shifts!: Table<Shift, string>;
  cashMovements!: Table<CashMovement, string>;
  expenses!: Table<Expense, string>;
  promotions!: Table<Promotion, string>;
  kv!: Table<KV, string>;

  constructor(name = 'urito') {
    super(name);
    for (const m of MIGRATIONS) {
      const builder = this.version(m.version).stores(m.stores);
      if (m.upgrade) builder.upgrade(m.upgrade);
    }
  }
}

export type DemoScenario = 'ja-retail' | 'ja-cafe' | 'ja-restaurant';
export const PROD_DB_NAME = 'urito';
export const DEMO_DB_NAME = 'urito-demo';
export const DEMO_SESSION_KEY = 'urito.demo';

export function parseDemoScenario(raw: string | null | undefined): DemoScenario | null {
  if (raw === 'ja-retail' || raw === 'ja-cafe' || raw === 'ja-restaurant') return raw;
  return null;
}

function safeSessionStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** E-02: URL の ?demo=... または sessionStorage を参照し、Dexie 生成前に接続先DB名を決定する。 */
export function resolveDbName(
  search = typeof window !== 'undefined' ? window.location.search : '',
  storage = safeSessionStorage(),
): string {
  const param = parseDemoScenario(new URLSearchParams(search).get('demo'));
  if (param) {
    storage?.setItem(DEMO_SESSION_KEY, param);
    return DEMO_DB_NAME;
  }
  const saved = parseDemoScenario(storage?.getItem(DEMO_SESSION_KEY));
  return saved ? DEMO_DB_NAME : PROD_DB_NAME;
}

export function getDemoScenario(
  search = typeof window !== 'undefined' ? window.location.search : '',
  storage = safeSessionStorage(),
): DemoScenario | null {
  const param = parseDemoScenario(new URLSearchParams(search).get('demo'));
  if (param) return param;
  return parseDemoScenario(storage?.getItem(DEMO_SESSION_KEY));
}

export function setDemoScenarioStorage(scenario: DemoScenario, storage = safeSessionStorage()): void {
  storage?.setItem(DEMO_SESSION_KEY, scenario);
}

export function clearDemoScenarioStorage(storage = safeSessionStorage()): void {
  storage?.removeItem(DEMO_SESSION_KEY);
}

export const db = new UritoDB(resolveDbName());

export function isDemoMode(): boolean {
  return db.name === DEMO_DB_NAME;
}

let openReady: Promise<void> | null = null;

/** スキーマ更新が必要な場合は、新バージョンを開く前に OPFS へ自動退避を行う。 */
export function ensureDbOpen(): Promise<void> {
  if (!openReady) {
    openReady = (async () => {
      await runPreUpgradeBackupIfNeeded(db.name, LATEST_SCHEMA_VERSION);
      await db.open();
    })();
  }
  return openReady;
}

/** Tables included in a backup snapshot, in restore order. */
export const BACKUP_TABLES = [
  'settings',
  'users',
  'categories',
  'modifierGroups',
  'products',
  'customers',
  'suppliers',
  'areas',
  'diningTables',
  'orders',
  'stockMovements',
  'purchases',
  'shifts',
  'cashMovements',
  'expenses',
  'promotions',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const row = await db.kv.get(key);
  return row?.value as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value });
}

export async function kvDelete(key: string): Promise<void> {
  await db.kv.delete(key);
}
