/** Sortable, collision-resistant ids that work offline (no server sequence). */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomPart(len: number): string {
  const bytes = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Time-prefixed id: lexicographic order == creation order. */
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
