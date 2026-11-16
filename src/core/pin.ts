import type { User } from '@/db/types';

/** B-06: 遅い端末でも 150ms 以内で検証できる強度として 150,000 回を既定とする。 */
export const PIN_PBKDF2_ITERATIONS = 150_000;

export interface LockoutRecord {
  fails: number;
  until: number;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const len = Math.floor(hex.length / 2);
  const buf = new ArrayBuffer(len);
  const out = new Uint8Array(buf);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16) || 0;
  }
  return out;
}

function randomSaltHex(byteLen = 16): string {
  const buf = new ArrayBuffer(byteLen);
  const bytes = new Uint8Array(buf);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function constantTimeEquals(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

/** スタッフが PIN を設定済みか判定する（移行前の平文 pin とハッシュ済み pinHash の双方に対応）。 */
export function hasPin(user: Pick<User, 'pin' | 'pinHash'>): boolean {
  return Boolean(user.pinHash || user.pin);
}

/** PBKDF2-SHA256 を用いて PIN をソルト付きでハッシュ化する（B-06）。 */
export async function hashPin(pin: string, saltHex = randomSaltHex()): Promise<{ hash: string; salt: string }> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: hexToBytes(saltHex),
      iterations: PIN_PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    256,
  );
  return { hash: bytesToHex(new Uint8Array(derived)), salt: saltHex };
}

/** 入力された PIN をユーザーのハッシュ（未移行ユーザーは平文 PIN）と定数時間比較で照合する。 */
export async function verifyPin(pin: string, user: Pick<User, 'pin' | 'pinHash' | 'pinSalt'>): Promise<boolean> {
  if (user.pinHash && user.pinSalt) {
    const { hash } = await hashPin(pin, user.pinSalt);
    return constantTimeEquals(hash, user.pinHash);
  }
  if (user.pin) {
    return constantTimeEquals(pin, user.pin);
  }
  return false;
}

/** 5回失敗以降は指数バックオフでロックアウト期限を更新する。 */
export function nextLockout(cur: LockoutRecord | undefined, now: number): LockoutRecord {
  const fails = (cur?.fails ?? 0) + 1;
  if (fails < 5) return { fails, until: 0 };
  const step = Math.min(4, Math.floor((fails - 5) / 2));
  const ms = 30_000 * 2 ** step;
  return { fails, until: now + ms };
}
