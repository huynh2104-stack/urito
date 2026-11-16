import { v3Migration } from './v3';
import type { MigrationDef } from './types';

/** スキーマ v4（C-01 商品画像の別テーブル分離）：
 *  - 商品一覧走査時に画像バイナリを読み込まないよう productImages ストアを分離する
 *  - 既存商品の dataURL 画像の移送はバックグラウンド移行タスクで安全に実施する */
export const v4Migration: MigrationDef = {
  version: 4,
  stores: {
    ...v3Migration.stores,
    productImages: 'productId',
  },
};
