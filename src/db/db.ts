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

export const db = new UritoDB();

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
