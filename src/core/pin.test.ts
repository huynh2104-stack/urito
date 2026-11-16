import { describe, expect, it } from 'vitest';
import { hashPin, hasPin, nextLockout, verifyPin } from './pin';

describe('PBKDF2-SHA256 による PIN ハッシュ化・検証とロックアウト (B-06)', () => {
  it('同一PINをハッシュ化し verifyPin で検証成功・誤PINで失敗し、平文を含まない', async () => {
    const { hash, salt } = await hashPin('1234');
    expect(salt).toHaveLength(32);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain('1234');

    const user = { pin: '', pinHash: hash, pinSalt: salt };
    expect(hasPin(user)).toBe(true);
    expect(await verifyPin('1234', user)).toBe(true);
    expect(await verifyPin('12345', user)).toBe(false);
    expect(await verifyPin('0000', user)).toBe(false);
  });

  it('未移行の平文 PIN ユーザーも移行完了までは検証でき、PIN未設定は false となる', async () => {
    expect(hasPin({ pin: '', pinHash: undefined })).toBe(false);
    expect(await verifyPin('4321', { pin: '4321', pinHash: undefined, pinSalt: undefined })).toBe(true);
    expect(await verifyPin('9999', { pin: '4321', pinHash: undefined, pinSalt: undefined })).toBe(false);
  });

  it('連続失敗回数が5回以上で段階的ロックアウト時間が増加する', () => {
    const now = 1_700_000_000_000;
    let rec = nextLockout(undefined, now); // 1回目
    expect(rec.until).toBe(0);
    for (let i = 0; i < 3; i++) rec = nextLockout(rec, now); // 2, 3, 4回目
    expect(rec.until).toBe(0);
    rec = nextLockout(rec, now); // 5回目: 30秒ロック
    expect(rec.fails).toBe(5);
    expect(rec.until).toBe(now + 30_000);
    rec = nextLockout(rec, now); // 6回目: 30秒
    rec = nextLockout(rec, now); // 7回目: 60秒
    expect(rec.until).toBe(now + 60_000);
  });
});
