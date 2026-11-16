import Dexie, { type Table } from 'dexie';
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

/** Everything lives in the browser's IndexedDB - no server, no running cost.
 *  Dexie gives us indexes, transactions and typed tables over it. */
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

  constructor() {
    super('urito');
    this.version(1).stores({
      settings: 'id',
      users: 'id, name, role, active',
      categories: 'id, name, sort, active',
      modifierGroups: 'id, name, sort',
      products: 'id, name, sku, barcode, categoryId, active, favorite, sort, stock',
      customers: 'id, name, phone, code, active, debt, points',
      suppliers: 'id, name, phone, active',
      areas: 'id, sort',
      diningTables: 'id, areaId, sort',
      orders: 'id, code, status, type, createdAt, paidAt, customerId, shiftId, userId, tableId',
      stockMovements: 'id, productId, type, at, refId',
      purchases: 'id, code, supplierId, status, createdAt',
      shifts: 'id, code, userId, status, openedAt, closedAt',
      cashMovements: 'id, shiftId, type, at',
      expenses: 'id, category, at, shiftId',
      promotions: 'id, code, active',
      kv: 'key',
    });
  }
}

export const db = new UritoDB();

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
