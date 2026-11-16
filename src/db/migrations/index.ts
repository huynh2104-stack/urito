import { v1Migration } from './v1';
import type { MigrationDef } from './types';

/** 登録済みマイグレーション一覧（version昇順）。 */
export const MIGRATIONS: MigrationDef[] = [v1Migration];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
