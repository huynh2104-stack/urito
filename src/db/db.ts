import Dexie, { type Table } from 'dexie';
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from './migrations';
import { runPreUpgradeBackupIfNeeded } from './preUpgrade';
import type {
  Area,
  CashMovement,
  Category,
  Customer,
  DailyProductStatsRow,
  DailyStatsRow,
  DiningTable,
  Expense,
  KV,
  ModifierGroup,
  Order,
  Product,
  ProductImageRow,
  Promotion,
  Purchase,
  Settings,
  Shift,
  StockMovement,
  Supplier,
  User,
} from './types';

/** バックアップ対象となるテーブル一覧（復元順に定義）。 */
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

/** すべてのデータはブラウザの IndexedDB に保存する（サーバー不要・運用費ゼロ）。 */
export class UritoDB extends Dexie {
  settings!: Table<Settings, string>;
  users!: Table<User, string>;
  categories!: Table<Category, string>;
  modifierGroups!: Table<ModifierGroup, string>;
  products!: Table<Product, string>;
  productImages!: Table<ProductImageRow, string>;
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
  dailyStats!: Table<DailyStatsRow, string>;
  dailyProductStats!: Table<DailyProductStatsRow, [string, string]>;
  kv!: Table<KV, string>;

  constructor(name = 'urito') {
    super(name);
    for (const m of MIGRATIONS) {
      const builder = this.version(m.version).stores(m.stores);
      if (m.upgrade) builder.upgrade(m.upgrade);
    }
    if (name !== DEMO_DB_NAME) {
      for (const tblName of BACKUP_TABLES) {
        const tbl = this.table(tblName);
        tbl.hook('creating', () => {
          markDbDirty();
        });
        tbl.hook('updating', () => {
          markDbDirty();
        });
        tbl.hook('deleting', () => {
          markDbDirty();
        });
      }
    }
  }
}

export type DemoScenario = 'ja-retail' | 'ja-cafe' | 'ja-restaurant';
export const PROD_DB_NAME = 'urito';
export const DEMO_DB_NAME = 'urito-demo';
export const DEMO_SESSION_KEY = 'urito.demo';

export function parseDemoScenario(raw: string | null | undefined): DemoScenario | null {
  if (raw === 'ja-retail' || raw === 'ja-cafe' || raw === 'ja-restaurant') return raw;
  if (raw === '1' || raw === 'true') return 'ja-retail';
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


const DIRTY_KEY = 'urito.backup.dirty';
let dbDirtyMem = false;
let suppressDirtyDepth = 0;

/** C-06: 自動バックアップ後にいずれかの業務テーブルが更新されたかを返す。 */
export function isDbDirty(): boolean {
  if (dbDirtyMem) return true;
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(DIRTY_KEY) === '1';
  } catch {
    return dbDirtyMem;
  }
}

export function markDbDirty(): void {
  if (suppressDirtyDepth > 0) return;
  dbDirtyMem = true;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(DIRTY_KEY, '1');
  } catch {
    /* プライベート環境等で localStorage が使えない場合はメモリ保持のみ行う */
  }
}

export function clearDbDirty(): void {
  dbDirtyMem = false;
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(DIRTY_KEY);
  } catch {
    /* localStorage 利用不可時はメモリ状態のみ更新する */
  }
}

/** バックアップ時刻保存など内部メタデータ更新中に dirty フラグを立てないためのラッパー。 */
export async function withoutDirtyTracking<T>(fn: () => Promise<T>): Promise<T> {
  suppressDirtyDepth += 1;
  try {
    return await fn();
  } finally {
    suppressDirtyDepth -= 1;
  }
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
