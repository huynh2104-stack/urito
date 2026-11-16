import type { MigrationDef } from './types';

/** v0.5.0 初期スキーマ（version 1）。 */
export const v1Migration: MigrationDef = {
  version: 1,
  stores: {
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
  },
};
