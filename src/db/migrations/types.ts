import type { Transaction } from 'dexie';

/** スキーマバージョンの定義。
 *  upgrade 関数内では IndexedDB（Dexieトランザクション）の操作のみを行い、
 *  fetch や OPFS 等の外部非同期 API は絶対に呼び出さない。 */
export interface MigrationDef {
  version: number;
  stores: Record<string, string>;
  upgrade?: (tx: Transaction) => Promise<void> | void;
}
