import { v5Migration } from './v5';
import type { MigrationDef } from './types';

/** F-02: 多言語商品カタログ・多通貨価格保持のためのスキーマ v6。 */
export const v6Migration: MigrationDef = {
  version: 6,
  stores: {
    ...v5Migration.stores,
  },
};
