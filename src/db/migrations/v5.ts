import { v4Migration } from './v4';
import type { MigrationDef } from './types';

/** C-04: 日次売上集計・商品別日次集計テーブルを追加するスキーマ v5 マイグレーション。 */
export const v5Migration: MigrationDef = {
  version: 5,
  stores: {
    ...v4Migration.stores,
    dailyStats: 'day',
    dailyProductStats: '[day+productId], productId',
  },
};
