import { useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';

/** IndexedDB クエリを購読するフック。対象テーブルへの書き込み時に Dexie が自動で再評価する。 */
export function useLiveQuery<T>(querier: () => Promise<T>, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);
  const querierRef = useRef(querier);

  useEffect(() => {
    querierRef.current = querier;
  });

  useEffect(() => {
    const sub = liveQuery(() => querierRef.current()).subscribe({
      next: (v) => setValue(v),
      error: (err) => console.error('[urito] live query failed', err),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 呼び出し元から渡される依存配列のみを監視する
  }, deps);

  return value;
}
