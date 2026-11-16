import { db } from './db';

export type SeqName = 'order' | 'shift' | 'purchase' | 'customer' | 'sku';

const DEVICE_NO_KEY = 'device.no';

function generateDeviceNo(): string {
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const b = new Uint8Array(2);
    crypto.getRandomValues(b);
    return chars[b[0] % chars.length] + chars[b[1] % chars.length];
  }
  return '01';
}

/** 同一トランザクション内で連番カウンターを原子的（read-modify-write）にインクリメントする。 */
export async function nextSeq(name: SeqName): Promise<number> {
  return db.transaction('rw', db.kv, async () => {
    const key = `seq.${name}`;
    const row = await db.kv.get(key);
    const cur = typeof row?.value === 'number' && Number.isFinite(row.value) ? row.value : 0;
    const next = cur + 1;
    await db.kv.put({ key, value: next });
    return next;
  });
}

export async function peekSeq(name: SeqName): Promise<number> {
  const row = await db.kv.get(`seq.${name}`);
  return typeof row?.value === 'number' && Number.isFinite(row.value) ? row.value : 0;
}

export async function setSeq(name: SeqName, value: number): Promise<void> {
  const n = Math.max(0, Math.trunc(value));
  await db.kv.put({ key: `seq.${name}`, value: n });
}

/** この端末のレジ番号を取得する（未設定なら自動生成して保存）。バックアップには含めない。 */
export async function getDeviceNo(): Promise<string> {
  const row = await db.kv.get(DEVICE_NO_KEY);
  if (typeof row?.value === 'string' && row.value.trim()) {
    return row.value.trim();
  }
  const generated = generateDeviceNo();
  await db.kv.put({ key: DEVICE_NO_KEY, value: generated });
  return generated;
}

export async function setDeviceNo(no: string): Promise<string> {
  const clean = no.trim().toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 4) || '01';
  await db.kv.put({ key: DEVICE_NO_KEY, value: clean });
  return clean;
}
