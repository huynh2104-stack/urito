import { useEffect, useState } from 'react';

/** 現在時刻を一定間隔で更新して返すフック。
 *  render中のDate.now()直接呼び出しを避け、経過時間表示を純粋に保つ。 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
