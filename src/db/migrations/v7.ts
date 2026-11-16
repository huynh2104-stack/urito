import { v6Migration } from './v6';
import type { MigrationDef } from './types';

/** F-03: EC受注の重複取込を防止するため orders に [channel+externalId] 複合インデックスを追加するスキーマ v7。 */
export const v7Migration: MigrationDef = {
  version: 7,
  stores: {
    ...v6Migration.stores,
    orders: 'id, code, status, type, createdAt, paidAt, customerId, shiftId, userId, tableId, [status+tableId], [channel+externalId]',
  },
};
