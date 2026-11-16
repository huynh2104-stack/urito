import { v1Migration } from './v1';
import { v2Migration } from './v2';
import { v3Migration } from './v3';
import { v4Migration } from './v4';
import type { MigrationDef } from './types';

/** 登録済みマイグレーション一覧（version昇順）。 */
export const MIGRATIONS: MigrationDef[] = [v1Migration, v2Migration, v3Migration, v4Migration];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
