import { db } from '../db';
import { defaultSettings } from '../defaults';
import type { Settings } from '../types';

/** 起動時に軽量な初期設定のみ取得・作成し、大容量の初期カタログ(seed/index)を読まずに済ませる。 */
export async function loadOrInitSettings(): Promise<Settings> {
  const existing = await db.settings.get('app');
  if (existing) return existing;
  const fresh = defaultSettings();
  await db.settings.put(fresh);
  return fresh;
}
