import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { getErrorLog, isChunkLoadError, recordError } from './errorLog';

describe('診断エラーログ (errorLog)', () => {
  beforeEach(async () => {
    await db.open();
    await db.kv.clear();
  });

  it('最大50件のリングバッファとして古いログを押し出す', async () => {
    for (let i = 1; i <= 55; i++) {
      await recordError('error', new Error(`err-${i}`), '/pos');
    }
    const list = await getErrorLog();
    expect(list).toHaveLength(50);
    expect(list[0]?.message).toBe('err-6');
    expect(list[49]?.message).toBe('err-55');
  });

  it('チャンク読み込みエラーを判別する', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: /x.js'))).toBe(true);
    expect(isChunkLoadError(Object.assign(new Error('loading chunk 1 failed'), { name: 'ChunkLoadError' }))).toBe(true);
    expect(isChunkLoadError(new Error('Database error'))).toBe(false);
  });
});
