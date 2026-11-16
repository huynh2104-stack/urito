import { useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';

/** Subscribe a component to an IndexedDB query. Dexie re-runs the querier
 *  whenever a write touches a table it read, so every screen stays in sync
 *  without any manual invalidation. */
export function useLiveQuery<T>(querier: () => Promise<T>, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);
  const querierRef = useRef(querier);
  querierRef.current = querier;

  useEffect(() => {
    const sub = liveQuery(() => querierRef.current()).subscribe({
      next: (v) => setValue(v as T),
      error: (err) => console.error('[urito] live query failed', err),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}
