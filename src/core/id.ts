/** オフライン環境でサーバー採番なしに時系列順・衝突耐性のある ID を生成する。 */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomPart(len: number): string {
  const bytes = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** 先頭をタイムスタンプ順とし、辞書順と作成順が一致する ID を返す。 */
export function newId(prefix = ''): string {
  const time = Date.now().toString(36).padStart(9, '0');
  return `${prefix}${time}${randomPart(6)}`;
}

/** 伝票・シフト等の表示用コードを生成する（端末番号あり: HD01-261116-0042）。 */
export function formatCode(prefix: string, seq: number, at = new Date(), deviceNo = ''): string {
  const y = String(at.getFullYear()).slice(-2);
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  const dev = deviceNo ? `${deviceNo}-` : '';
  return `${prefix}${dev}${y}${m}${d}-${String(seq).padStart(4, '0')}`;
}
